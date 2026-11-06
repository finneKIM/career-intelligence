import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from './helpers/testDb';
import { makeTransport } from './helpers/accountHarness';
import { CareerIntelDB } from '../src/db';
import { login, prepareSignup, submitSignup, type Transport } from '../src/features/account/accountClient';
import { pendingCount, syncOnce, wipeLocal, type SyncContext } from '../src/features/sync/syncEngine';
import type { Profile, Project } from '../src/types';
import type { Db } from '../server/db/types';

let h: Awaited<ReturnType<typeof startTestDb>>;
let db: Db;
beforeAll(async () => {
  h = await startTestDb();
  db = h.db;
}, 60000);
afterAll(() => h.close());

const PW = 'sync-test-password-1';
let seq = 0;

/** 같은 계정으로 로그인한 "기기" 하나(자기 IndexedDB + 자기 쿠키) */
async function device(email: string, firstSignup: boolean) {
  const ip = `10.9.${Math.floor(seq / 200)}.${(seq++ % 200) + 1}`;
  const t = makeTransport(db, ip);
  let r: { userId: string; dek: CryptoKey };
  if (firstSignup) r = await submitSignup(t, email, await prepareSignup(PW), { aiDataTransfer: false });
  else r = await login(t, email, PW);
  const local = new CareerIntelDB('dev-' + ip);
  await local.open();
  const ctx = (transport: Transport = t): SyncContext => ({ db: local, transport, dek: r.dek, userId: r.userId });
  return { local, ctx, t, userId: r.userId };
}

const project = (id: string, title: string, updatedAt = '2026-11-06T00:00:00.000Z'): Project => ({
  id, title, period: { startDate: '2026-01', isOngoing: false }, role: '개발', techStack: ['TS'], description: '설명',
  outcomes: ['성과 하나'], createdAt: '2026-11-01T00:00:00.000Z', updatedAt,
});
const profile = (): Profile => ({
  id: 'current-user', name: '김시험', title: '엔지니어', targetRole: 'AI', targetDomains: [], skills: ['TS'],
  email: 'kim@test.invalid', phone: '010-5555-6666', address: '서울', redactTerms: ['시험대학교'], updatedAt: '2026-11-06T00:00:00.000Z',
});

describe('두 기기 동기화 (Dexie 2개 + 가짜 서버)', () => {
  it('기기 A의 변경이 B에 반영되고, 프로필 연락처는 별도 칸으로 분리되어 서버에서 읽히지 않아야 합니다', async () => {
    const A = await device('s1@example.test', true);
    await A.local.projects.put(project('p1', '첫 프로젝트'));
    await A.local.profiles.put(profile());
    const rep = await syncOnce(A.ctx());
    expect(rep.pushed).toBe(2);

    const B = await device('s1@example.test', false);
    const repB = await syncOnce(B.ctx());
    expect(repB.pulled).toBe(2);
    expect((await B.local.projects.get('p1'))?.title).toBe('첫 프로젝트');
    expect(await B.local.profiles.get('current-user')).toMatchObject({ name: '김시험', email: 'kim@test.invalid', phone: '010-5555-6666', redactTerms: ['시험대학교'] });

    // 서버: contact 칸이 따로 있고, 본문 칸 안에는 이름·연락처가 없다(암호문이라 어차피 읽히지 않음) — 칸이 분리됐는지 확인
    const row = (await db.query<{ contact_enc: Buffer | null; payload_enc: Buffer }>(`SELECT contact_enc, payload_enc FROM profiles WHERE user_id=$1`, [A.userId])).rows[0];
    expect(row.contact_enc).not.toBeNull();
    expect(Buffer.from(row.payload_enc).toString('latin1')).not.toContain('kim@test');

    // 같은 동기화를 또 해도 아무것도 올리거나 받지 않는다(멱등)
    const again = await syncOnce(A.ctx());
    expect(again.pushed + again.pulled + again.deleted).toBe(0);
  }, 120000);

  it('수정과 삭제가 전파되고, 오프라인 중 변경은 복귀 후 반영되어야 합니다', async () => {
    const A = await device('s2@example.test', true);
    const B = await device('s2@example.test', false);
    await A.local.projects.bulkPut([project('a', 'A1'), project('b', 'B1')]);
    await syncOnce(A.ctx());
    await syncOnce(B.ctx());

    await A.local.projects.update('a', { title: 'A2', updatedAt: '2026-11-07T00:00:00.000Z' });
    await A.local.projects.delete('b');
    expect(await pendingCount(A.local)).toBe(2);
    await syncOnce(A.ctx());
    expect(await pendingCount(A.local)).toBe(0);
    await syncOnce(B.ctx());
    expect((await B.local.projects.get('a'))?.title).toBe('A2');
    expect(await B.local.projects.get('b')).toBeUndefined();

    // B 오프라인(전송 실패) 중 변경 → 복귀 후 반영
    await B.local.projects.put(project('c', '오프라인 작성'));
    const offline: Transport = async () => {
      throw new Error('offline');
    };
    await expect(syncOnce(B.ctx(offline))).rejects.toThrow();
    expect(await pendingCount(B.local)).toBe(1);
    await syncOnce(B.ctx());
    await syncOnce(A.ctx());
    expect((await A.local.projects.get('c'))?.title).toBe('오프라인 작성');
  }, 120000);

  it('같은 레코드를 동시에 고쳐도 데이터가 사라지지 않고(진 쪽은 충돌 기록에 보관) 두 기기가 같아져야 합니다', async () => {
    const A = await device('s3@example.test', true);
    const B = await device('s3@example.test', false);
    await A.local.projects.put(project('x', '원본'));
    await syncOnce(A.ctx());
    await syncOnce(B.ctx());

    await A.local.projects.update('x', { title: 'A의 수정', updatedAt: '2026-11-07T10:00:00.000Z' });
    await B.local.projects.update('x', { title: 'B의 수정', updatedAt: '2026-11-07T09:00:00.000Z' });
    await syncOnce(A.ctx()); // 서버 revision 2 = A의 수정
    const repB = await syncOnce(B.ctx()); // B 는 더 일찍 수정 → 서버(A) 쪽이 이김
    expect(repB.conflicts).toBeGreaterThan(0);
    await syncOnce(A.ctx());
    expect((await A.local.projects.get('x'))?.title).toBe('A의 수정');
    expect((await B.local.projects.get('x'))?.title).toBe('A의 수정');
    const lost = await B.local.syncConflicts.toArray();
    expect(lost.map((c) => JSON.parse(c.localCopy).title)).toContain('B의 수정'); // 진 쪽 사본 보존
  }, 120000);

  it('더 늦게 고친 로컬이 서버 변경을 이기면 서버 쪽 사본이 보존되어야 합니다', async () => {
    const A = await device('s4@example.test', true);
    const B = await device('s4@example.test', false);
    await A.local.projects.put(project('y', '원본'));
    await syncOnce(A.ctx());
    await syncOnce(B.ctx());
    await A.local.projects.update('y', { title: 'A 먼저', updatedAt: '2026-11-07T09:00:00.000Z' });
    await B.local.projects.update('y', { title: 'B 나중', updatedAt: '2026-11-07T10:00:00.000Z' });
    await syncOnce(A.ctx());
    await syncOnce(B.ctx());
    await syncOnce(A.ctx());
    expect((await A.local.projects.get('y'))?.title).toBe('B 나중');
    expect((await B.local.syncConflicts.toArray()).map((c) => JSON.parse(c.localCopy).title)).toContain('A 먼저');
  }, 120000);

  it('업로드 도중 끊겨도 이어서 올릴 수 있고 중복 행이 생기지 않아야 합니다(멱등)', async () => {
    const A = await device('s5@example.test', true);
    await A.local.projects.bulkPut(Array.from({ length: 60 }, (_, i) => project('bulk-' + i, '대량 ' + i)));
    let pushes = 0;
    const flaky: Transport = async (path, body) => {
      if (path === '/sync/push' && ++pushes === 2) throw new Error('network cut');
      return A.t(path, body);
    };
    await expect(syncOnce(A.ctx(flaky))).rejects.toThrow();
    const pendingAfterCut = await pendingCount(A.local);
    expect(pendingAfterCut).toBeGreaterThan(0);
    expect(pendingAfterCut).toBeLessThan(60); // 첫 묶음은 이미 반영됨
    await syncOnce(A.ctx());
    expect(await pendingCount(A.local)).toBe(0);
    const n = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM projects WHERE user_id=$1`, [A.userId])).rows[0].n);
    expect(n).toBe(60);
  }, 120000);

  it('분석 결과(추가 전용)는 한 번 올린 뒤 로컬에서 바뀌어도 서버에 수정본을 올리지 않아야 합니다', async () => {
    const A = await device('s6@example.test', true);
    await A.local.analysisResults.put({ id: 'r1', jdId: 'j', analyzedAt: '2026-11-06T00:00:00.000Z', summaryScore: 70 } as never);
    await syncOnce(A.ctx());
    await A.local.analysisResults.update('r1', { summaryScore: 99 } as never);
    expect(await pendingCount(A.local)).toBe(0);
    const rep = await syncOnce(A.ctx());
    expect(rep.pushed).toBe(0);
  }, 120000);

  it('500개 레코드 동기화 시간을 측정하고, 로그아웃 시 기기 데이터 삭제가 동작해야 합니다', async () => {
    const A = await device('s7@example.test', true);
    await A.local.projects.bulkPut(Array.from({ length: 500 }, (_, i) => project('m-' + i, '대량 ' + i)));
    const t0 = performance.now();
    const rep = await syncOnce(A.ctx());
    const ms = performance.now() - t0;
    console.log(`[측정] 500건 올리기 ${Math.round(ms)}ms (요청 ${Math.ceil(500 / 20)}회 이상, 로컬 가짜 서버 기준)`);
    expect(rep.pushed).toBe(500);
    const B = await device('s7@example.test', false);
    const t1 = performance.now();
    const repB = await syncOnce(B.ctx());
    console.log(`[측정] 500건 내려받기 ${Math.round(performance.now() - t1)}ms`);
    expect(repB.pulled).toBe(500);
    expect(await B.local.projects.count()).toBe(500);

    await wipeLocal(B.local);
    expect(await B.local.projects.count()).toBe(0);
    expect(await B.local.syncRecords.count()).toBe(0);
    // 서버 데이터는 그대로 → 다시 로그인해 동기화하면 복구된다
    await syncOnce(B.ctx());
    expect(await B.local.projects.count()).toBe(500);
  }, 300000);
});
