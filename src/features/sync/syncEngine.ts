/**
 * 동기화 엔진 (IndexedDB ↔ 서버 암호문). 브라우저가 주 저장소이고 서버는 암호화된 사본을 보관한다.
 *
 * 방식: "상태 비교" — 훅으로 변경을 가로채지 않고, 레코드의 해시를 마지막으로 서버와 맞춘 해시(syncRecords)와 비교한다.
 *  · 새 레코드/바뀐 레코드/사라진 레코드를 찾아 올리고(push), 서버의 변경분을 커서(seq) 기준으로 가져온다(pull).
 *  · 충돌(서버가 먼저 바뀜): 더 늦게 수정한 쪽이 이기고, 진 쪽의 사본은 syncConflicts 에 보관해 데이터 손실을 막는다.
 *  · 분석 결과·생성 문서는 추가 전용: 한 번 올린 뒤에는 수정본을 올리지 않는다(과거 분석 불변성).
 */
import type { CareerIntelDB } from '../../db';
import type { SyncRecord } from '../../types';
import { decryptRecord, encryptRecord, fromBase64Url, toBase64Url, type RecordContext } from '../../utils/crypto';
import type { Transport } from '../account/accountClient';

export interface SyncTableMap {
  local: keyof Pick<
    CareerIntelDB,
    'profiles' | 'projects' | 'jobDescriptions' | 'applications' | 'analysisResults' | 'sourceDocuments' | 'companyMaterials' | 'generatedDocuments'
  >;
  remote: string;
  appendOnly?: boolean;
}

export const SYNC_MAP: SyncTableMap[] = [
  { local: 'profiles', remote: 'profiles' },
  { local: 'projects', remote: 'projects' },
  { local: 'sourceDocuments', remote: 'source_documents' },
  { local: 'jobDescriptions', remote: 'job_postings' },
  { local: 'applications', remote: 'applications' },
  { local: 'analysisResults', remote: 'analysis_results', appendOnly: true },
  { local: 'companyMaterials', remote: 'company_materials' },
  { local: 'generatedDocuments', remote: 'generated_documents', appendOnly: true },
];

type Rec = { id: string } & Record<string, unknown>;

/** 연락처 칸(프로필에서 본문과 분리해 별도 암호문으로 보관) */
const CONTACT_FIELDS = ['name', 'email', 'phone', 'address', 'redactTerms'] as const;

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

export async function hashRecord(v: unknown): Promise<string> {
  const d = new TextEncoder().encode(stableStringify(v));
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer));
  return toBase64Url(h);
}

const modifiedAt = (r: Record<string, unknown>): string =>
  String(r.updatedAt ?? r.createdAt ?? r.analyzedAt ?? r.parsedAt ?? r.generatedAt ?? '');

export interface SyncReport {
  pushed: number;
  pulled: number;
  deleted: number;
  conflicts: number;
  uploadedTotal?: number;
}

export interface SyncContext {
  db: CareerIntelDB;
  transport: Transport;
  dek: CryptoKey;
  userId: string;
  onProgress?: (done: number, total: number) => void;
}

const recKey = (table: string, id: string) => `${table}:${id}`;
const ctxOf = (remote: string, userId: string, id: string, field?: string): RecordContext => ({ table: remote, userId, id, field });

interface PullRow {
  table: string;
  id: string;
  payload: string;
  nonce: string;
  contact: string | null;
  contactNonce: string | null;
  revision: number;
  seq: number;
  deleted: boolean;
}

async function decodeRow(c: SyncContext, map: SyncTableMap, row: PullRow): Promise<Rec> {
  const payload = await decryptRecord<Rec>(c.dek, { payload: fromBase64Url(row.payload), nonce: fromBase64Url(row.nonce) }, ctxOf(map.remote, c.userId, row.id));
  if (row.contact && row.contactNonce) {
    const contact = await decryptRecord<Record<string, unknown>>(
      c.dek,
      { payload: fromBase64Url(row.contact), nonce: fromBase64Url(row.contactNonce) },
      ctxOf(map.remote, c.userId, row.id, 'contact'),
    );
    return { ...payload, ...contact, id: row.id };
  }
  return { ...payload, id: row.id };
}

async function pull(c: SyncContext, fromStart: boolean, report: SyncReport): Promise<void> {
  const cursorItem = await c.db.syncState.get('cursor');
  // 같은 사용자의 동시 업로드로 번호가 늦게 확정되는 경우를 위해 조금 겹쳐서 가져온다(이미 반영된 수정 번호는 건너뜀)
  let since = fromStart ? 0 : Math.max(0, Number(cursorItem?.value ?? 0) - 200);
  for (;;) {
    const r = await c.transport('/sync/pull', { since, limit: 50 });
    if (r.status !== 200) throw new Error('동기화(가져오기)에 실패했습니다.');
    const rows = r.body.rows as PullRow[];
    for (const row of rows) {
      const map = SYNC_MAP.find((m) => m.remote === row.table);
      if (!map) continue;
      const key = recKey(map.local, row.id);
      const rec = await c.db.syncRecords.get(key);
      since = Math.max(since, row.seq);
      if (rec && row.revision <= rec.revision) continue; // 이미 반영됨(내가 올린 것 포함)
      const table = c.db.table<Rec, string>(map.local);
      const local = await table.get(row.id);
      if (row.deleted) {
        if (local) {
          const dirty = rec ? (await hashRecord(local)) !== rec.hash : true;
          if (dirty && rec) {
            // 내가 고친 것이 있는데 서버에서 지워짐 → 지우지 않고 보존(다음 올리기에서 부활)
            await c.db.syncRecords.put({ ...rec, revision: row.revision, seq: row.seq });
            continue;
          }
          await table.delete(row.id);
          report.deleted++;
        }
        await c.db.syncRecords.put({ key, table: map.local, recordId: row.id, revision: row.revision, hash: '', seq: row.seq });
        continue;
      }
      const remote = await decodeRow(c, map, row);
      const remoteHash = await hashRecord(remote);
      if (local) {
        const localHash = await hashRecord(local);
        if (localHash === remoteHash) {
          await c.db.syncRecords.put({ key, table: map.local, recordId: row.id, revision: row.revision, hash: remoteHash, seq: row.seq });
          continue;
        }
        const localDirty = !rec || rec.hash !== localHash;
        if (localDirty) {
          // 양쪽이 다르게 바뀜 → 늦게 수정한 쪽이 이기고, 진 쪽 사본을 보관
          report.conflicts++;
          if (modifiedAt(local) >= modifiedAt(remote)) {
            await c.db.syncConflicts.put({ id: crypto.randomUUID(), table: map.local, recordId: row.id, localCopy: JSON.stringify(remote), createdAt: new Date().toISOString() });
            await c.db.syncRecords.put({ key, table: map.local, recordId: row.id, revision: row.revision, hash: rec?.hash ?? '', seq: row.seq });
            continue; // 로컬이 이김 → 다음 올리기에서 새 기준 번호로 덮어씀
          }
          await c.db.syncConflicts.put({ id: crypto.randomUUID(), table: map.local, recordId: row.id, localCopy: JSON.stringify(local), createdAt: new Date().toISOString() });
        }
      }
      await table.put(remote);
      await c.db.syncRecords.put({ key, table: map.local, recordId: row.id, revision: row.revision, hash: remoteHash, seq: row.seq });
      report.pulled++;
    }
    await c.db.syncState.put({ key: 'cursor', value: since });
    if (!r.body.hasMore) break;
  }
}

interface Pending {
  map: SyncTableMap;
  id: string;
  record: Rec | null; // null = 삭제
  hash: string;
  base: number;
}

export async function collectPending(db: CareerIntelDB): Promise<Pending[]> {
  const out: Pending[] = [];
  for (const map of SYNC_MAP) {
    const rows = (await db.table<Rec, string>(map.local).toArray()).filter((r) => typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100);
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.id);
      const rec = await db.syncRecords.get(recKey(map.local, row.id));
      const hash = await hashRecord(row);
      if (!rec) out.push({ map, id: row.id, record: row, hash, base: 0 });
      else if (rec.hash !== hash) {
        if (map.appendOnly && rec.hash !== '') continue; // 추가 전용: 올린 뒤의 수정본은 올리지 않는다
        out.push({ map, id: row.id, record: row, hash, base: rec.revision });
      }
    }
    for (const rec of await db.syncRecords.where('table').equals(map.local).toArray()) {
      if (!seen.has(rec.recordId) && rec.hash !== '') out.push({ map, id: rec.recordId, record: null, hash: '', base: rec.revision });
    }
  }
  return out;
}

/** 올리지 못한 변경이 있는지(로그아웃 경고용) */
export async function pendingCount(db: CareerIntelDB): Promise<number> {
  return (await collectPending(db)).length;
}

async function encodeItem(c: SyncContext, p: Pending) {
  // 삭제 표시도 서버 규칙상 암호문이 필요하므로 빈 값을 암호화해 보낸다(서버는 payload를 바꾸지 않고 deleted_at만 설정)
  const body = p.record ?? {};
  let contact: Record<string, unknown> | null = null;
  let main: Record<string, unknown> = body;
  if (p.map.local === 'profiles' && p.record) {
    contact = {};
    main = { ...body };
    for (const f of CONTACT_FIELDS) {
      if (f in main) {
        contact[f] = main[f];
        delete main[f];
      }
    }
  }
  const enc = await encryptRecord(c.dek, main, ctxOf(p.map.remote, c.userId, p.id));
  const ce = contact ? await encryptRecord(c.dek, contact, ctxOf(p.map.remote, c.userId, p.id, 'contact')) : null;
  return {
    table: p.map.remote, id: p.id, payload: toBase64Url(enc.payload), nonce: toBase64Url(enc.nonce),
    contact: ce ? toBase64Url(ce.payload) : undefined, contactNonce: ce ? toBase64Url(ce.nonce) : undefined,
    keyVersion: 1, baseRevision: p.base, deleted: p.record === null,
  };
}

async function push(c: SyncContext, report: SyncReport): Promise<number> {
  const pending = await collectPending(c.db);
  let done = 0;
  let conflicts = 0;
  for (let i = 0; i < pending.length; ) {
    // 본문 한도(약 1MB) 안에서 묶음 구성: 최대 20건, 합계 600KB 이하
    const batch: Pending[] = [];
    const items: Awaited<ReturnType<typeof encodeItem>>[] = [];
    let size = 0;
    while (i < pending.length && batch.length < 20) {
      const it = await encodeItem(c, pending[i]);
      const sz = it.payload.length + (it.contact?.length ?? 0) + 200;
      if (batch.length > 0 && size + sz > 600_000) break;
      batch.push(pending[i]);
      items.push(it);
      size += sz;
      i++;
    }
    const r = await c.transport('/sync/push', { items });
    if (r.status !== 200) throw new Error(r.status === 400 ? '서버가 레코드를 거부했습니다(크기 또는 형식).' : '동기화(올리기)에 실패했습니다.');
    const results = r.body.results as { status: string; revision?: number; seq?: number }[];
    for (let k = 0; k < batch.length; k++) {
      const p = batch[k];
      const res = results[k];
      if (res.status === 'ok') {
        await c.db.syncRecords.put({ key: recKey(p.map.local, p.id), table: p.map.local, recordId: p.id, revision: res.revision!, hash: p.hash, seq: res.seq! } satisfies SyncRecord);
        report.pushed++;
      } else conflicts++;
      c.onProgress?.(++done, pending.length);
    }
  }
  return conflicts;
}

/** 한 번의 동기화: 가져오기 → 올리기 → (충돌이 있으면) 전체 다시 가져오기 → 다시 올리기 */
export async function syncOnce(c: SyncContext): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, deleted: 0, conflicts: 0 };
  await pull(c, false, report);
  let conflicts = await push(c, report);
  for (let attempt = 0; conflicts > 0 && attempt < 2; attempt++) {
    await pull(c, true, report);
    conflicts = await push(c, report);
  }
  await c.db.syncState.put({ key: 'lastSyncedAt', value: new Date().toISOString() });
  return report;
}

/** 서버가 아닌 이 기기의 데이터와 동기화 기록, 저장된 설정을 모두 지운다(로그아웃 + "이 기기 데이터 삭제") */
export async function wipeLocal(db: CareerIntelDB): Promise<void> {
  await db.delete();
  await db.open();
}
