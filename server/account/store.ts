/**
 * 계정·동기화 저장소 함수. 규칙:
 * - 모든 함수는 userId를 필수 인자로 받고 기본값이 없다(다른 사용자의 데이터에 닿을 수 없게).
 * - 테이블 이름은 아래 화이트리스트에서만 고른다(SQL 문자열에 사용자 입력을 넣지 않는다).
 * - 암호문·nonce는 바이트로만 다루고, 로그에 남기지 않는다.
 */
import type { Queryable } from '../db/types.js';

export interface SyncTableDef {
  /** 서버 테이블 이름 */
  name: string;
  maxPayload: number;
  /** 별도 연락처 칸(contact_enc) 보유 여부 */
  hasContact: boolean;
}

export const SYNC_TABLES: SyncTableDef[] = [
  { name: 'profiles', maxPayload: 131072, hasContact: true },
  { name: 'projects', maxPayload: 524288, hasContact: false },
  { name: 'source_documents', maxPayload: 524288, hasContact: false },
  { name: 'job_postings', maxPayload: 524288, hasContact: false },
  { name: 'applications', maxPayload: 524288, hasContact: false },
  { name: 'analysis_results', maxPayload: 524288, hasContact: false },
  { name: 'company_materials', maxPayload: 524288, hasContact: false },
  { name: 'generated_documents', maxPayload: 524288, hasContact: false },
];
export const tableDef = (name: string): SyncTableDef | undefined => SYNC_TABLES.find((t) => t.name === name);

export interface KeyRow {
  kdf_algorithm: string;
  kdf_iterations: number;
  kdf_salt: Buffer;
  wrapped_dek: Buffer;
  wrapped_dek_nonce: Buffer;
  key_version: number;
}

export interface NewAccount {
  userId: string;
  authSubject: string;
  iterations: number;
  salt: Buffer;
  wrappedDek: Buffer;
  nonce: Buffer;
  recoveryWrappedDek: Buffer;
  recoveryNonce: Buffer;
  recoveryVerifier: Buffer; // sha256 32바이트
  consents: { kind: string; policyVersion: string }[];
}

export async function createAccountRows(tx: Queryable, a: NewAccount): Promise<void> {
  await tx.query('INSERT INTO users (id, auth_subject) VALUES ($1, $2)', [a.userId, a.authSubject]);
  await tx.query(
    `INSERT INTO user_keys (user_id, kdf_algorithm, kdf_iterations, kdf_salt, wrapped_dek, wrapped_dek_nonce,
       recovery_wrapped_dek, recovery_nonce, recovery_verifier)
     VALUES ($1, 'PBKDF2-SHA256', $2, $3, $4, $5, $6, $7, $8)`,
    [a.userId, a.iterations, a.salt, a.wrappedDek, a.nonce, a.recoveryWrappedDek, a.recoveryNonce, a.recoveryVerifier],
  );
  for (const c of a.consents) {
    await tx.query('INSERT INTO consents (user_id, kind, policy_version, agreed) VALUES ($1, $2, $3, true)', [a.userId, c.kind, c.policyVersion]);
  }
}

export async function findUserIdByAuthSubject(db: Queryable, authSubject: string): Promise<string | null> {
  const r = await db.query<{ id: string }>('SELECT id FROM users WHERE auth_subject = $1', [authSubject]);
  return r.rows[0]?.id ?? null;
}

export async function getKeys(db: Queryable, userId: string): Promise<KeyRow | null> {
  const r = await db.query<KeyRow>(
    'SELECT kdf_algorithm, kdf_iterations, kdf_salt, wrapped_dek, wrapped_dek_nonce, key_version FROM user_keys WHERE user_id = $1',
    [userId],
  );
  return r.rows[0] ?? null;
}

export async function getKeysByEmail(db: Queryable, email: string): Promise<{ userId: string; authId: string; salt: Buffer; iterations: number } | null> {
  const r = await db.query<{ id: string; auth_id: string; kdf_salt: Buffer; kdf_iterations: number }>(
    `SELECT u.id, u.auth_subject AS auth_id, k.kdf_salt, k.kdf_iterations
       FROM "user" au JOIN users u ON u.auth_subject = au.id JOIN user_keys k ON k.user_id = u.id
      WHERE lower(au.email) = lower($1)`,
    [email],
  );
  const x = r.rows[0];
  return x ? { userId: x.id, authId: x.auth_id, salt: x.kdf_salt, iterations: x.kdf_iterations } : null;
}

export async function replaceWrappedKey(
  db: Queryable,
  userId: string,
  k: { iterations: number; salt: Buffer; wrappedDek: Buffer; nonce: Buffer },
): Promise<void> {
  await db.query(
    `UPDATE user_keys SET kdf_iterations=$2, kdf_salt=$3, wrapped_dek=$4, wrapped_dek_nonce=$5,
            recovery_failures=0, recovery_locked_until=NULL, updated_at=now() WHERE user_id=$1`,
    [userId, k.iterations, k.salt, k.wrappedDek, k.nonce],
  );
}

/** 복구 시도 상태: 잠금 중인지, 검증값 */
export async function getRecoveryState(db: Queryable, userId: string) {
  const r = await db.query<{ recovery_verifier: Buffer; locked: boolean; recovery_wrapped_dek: Buffer; recovery_nonce: Buffer }>(
    `SELECT recovery_verifier, recovery_wrapped_dek, recovery_nonce,
            (recovery_locked_until IS NOT NULL AND recovery_locked_until > now()) AS locked FROM user_keys WHERE user_id=$1`,
    [userId],
  );
  return r.rows[0] ?? null;
}
/** 실패 기록: 5회 연속 실패하면 15분 잠금 */
export async function recordRecoveryFailure(db: Queryable, userId: string): Promise<void> {
  await db.query(
    `UPDATE user_keys SET
            recovery_locked_until = CASE WHEN recovery_failures + 1 >= 5 THEN now() + interval '15 minutes' ELSE recovery_locked_until END,
            recovery_failures = CASE WHEN recovery_failures + 1 >= 5 THEN 0 ELSE recovery_failures + 1 END
      WHERE user_id=$1`,
    [userId],
  );
}

/** 탈퇴: 우리 쪽 users(연쇄 삭제)와 로그인 서비스 사용자를 한 트랜잭션에서 지운다 */
export async function deleteAccountRows(tx: Queryable, userId: string, authSubject: string): Promise<void> {
  await tx.query('DELETE FROM users WHERE id = $1', [userId]);
  await tx.query('DELETE FROM "user" WHERE id = $1', [authSubject]);
}

// ---------------------------------------------------------------
// 동기화
// ---------------------------------------------------------------
export interface PushItem {
  table: string;
  id: string;
  payload: Buffer;
  nonce: Buffer;
  contact?: Buffer | null;
  contactNonce?: Buffer | null;
  keyVersion: number;
  /** 0 = 새 레코드. 그 외는 클라이언트가 알고 있는 서버 수정 번호 */
  baseRevision: number;
  deleted: boolean;
}
export type PushResult =
  | { table: string; id: string; status: 'ok'; revision: number; seq: number }
  | { table: string; id: string; status: 'conflict' };

export async function pushItem(db: Queryable, userId: string, it: PushItem): Promise<PushResult> {
  const def = tableDef(it.table);
  if (!def) throw new Error('unknown table');
  const T = def.name; // 화이트리스트 이름만
  const contactCols = def.hasContact ? ', contact_enc, contact_nonce' : '';
  const base: unknown[] = [userId, it.id, it.payload, it.nonce, it.keyVersion];
  if (it.baseRevision === 0) {
    const params = [...base, it.deleted ? new Date() : null, ...(def.hasContact ? [it.contact ?? null, it.contactNonce ?? null] : [])];
    const r = await db.query<{ revision: number; seq: string }>(
      `INSERT INTO ${T} (user_id, id, payload_enc, payload_nonce, key_version, deleted_at${contactCols})
       VALUES ($1,$2,$3,$4,$5,$6${def.hasContact ? ', $7, $8' : ''}) ON CONFLICT (user_id, id) DO NOTHING RETURNING revision, seq`,
      params,
    );
    return r.rows[0] ? { table: T, id: it.id, status: 'ok', revision: r.rows[0].revision, seq: Number(r.rows[0].seq) } : { table: T, id: it.id, status: 'conflict' };
  }
  if (it.deleted) {
    // 삭제 표시: 암호문은 그대로 두고(추가 전용 테이블 트리거와도 충돌 없음) 삭제 시각과 수정 번호만 바꾼다
    const d = await db.query<{ revision: number; seq: string }>(
      `UPDATE ${T} SET revision=revision+1, seq=nextval('sync_seq'), updated_at=now(), deleted_at=now()
        WHERE user_id=$1 AND id=$2 AND revision=$3 RETURNING revision, seq`,
      [userId, it.id, it.baseRevision],
    );
    return d.rows[0] ? { table: T, id: it.id, status: 'ok', revision: d.rows[0].revision, seq: Number(d.rows[0].seq) } : { table: T, id: it.id, status: 'conflict' };
  }
  const params = [...base, it.baseRevision, it.deleted, ...(def.hasContact ? [it.contact ?? null, it.contactNonce ?? null] : [])];
  const r = await db.query<{ revision: number; seq: string }>(
    `UPDATE ${T} SET payload_enc=$3, payload_nonce=$4, key_version=$5, revision=revision+1, seq=nextval('sync_seq'),
            updated_at=now(), deleted_at = CASE WHEN $7 THEN now() ELSE NULL END${def.hasContact ? ', contact_enc=$8, contact_nonce=$9' : ''}
      WHERE user_id=$1 AND id=$2 AND revision=$6 RETURNING revision, seq`,
    params,
  );
  return r.rows[0] ? { table: T, id: it.id, status: 'ok', revision: r.rows[0].revision, seq: Number(r.rows[0].seq) } : { table: T, id: it.id, status: 'conflict' };
}

export interface PulledRow {
  table: string;
  id: string;
  payload: Buffer;
  nonce: Buffer;
  contact: Buffer | null;
  contactNonce: Buffer | null;
  keyVersion: number;
  revision: number;
  seq: number;
  deleted: boolean;
}

export async function pullChanges(db: Queryable, userId: string, since: number, limit: number): Promise<{ rows: PulledRow[]; hasMore: boolean }> {
  const all: PulledRow[] = [];
  for (const def of SYNC_TABLES) {
    const c = def.hasContact ? ', contact_enc, contact_nonce' : ', NULL::bytea AS contact_enc, NULL::bytea AS contact_nonce';
    const r = await db.query<{
      id: string; payload_enc: Buffer; payload_nonce: Buffer; contact_enc: Buffer | null; contact_nonce: Buffer | null;
      key_version: number; revision: number; seq: string; deleted_at: Date | null;
    }>(
      `SELECT id, payload_enc, payload_nonce, key_version, revision, seq, deleted_at${c}
         FROM ${def.name} WHERE user_id=$1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [userId, since, limit + 1],
    );
    for (const x of r.rows) {
      all.push({
        table: def.name, id: x.id, payload: x.payload_enc, nonce: x.payload_nonce, contact: x.contact_enc, contactNonce: x.contact_nonce,
        keyVersion: x.key_version, revision: x.revision, seq: Number(x.seq), deleted: x.deleted_at !== null,
      });
    }
  }
  all.sort((a, b) => a.seq - b.seq);
  return { rows: all.slice(0, limit), hasMore: all.length > limit };
}

/** 삭제 표시가 30일 지난 행을 실제로 지운다(요청 중 지연 정리: Hobby 크론은 하루 1회라 의존하지 않는다) */
export async function purgeTombstones(db: Queryable, userId: string): Promise<void> {
  for (const def of SYNC_TABLES) {
    await db.query(`DELETE FROM ${def.name} WHERE user_id=$1 AND deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'`, [userId]);
  }
}

/** 내 행 개수(탈퇴·격리 시험용) */
export async function countRows(db: Queryable, userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const name of ['users', 'user_keys', 'user_settings', 'consents', ...SYNC_TABLES.map((t) => t.name)]) {
    const col = name === 'users' ? 'id' : 'user_id';
    out[name] = Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${name} WHERE ${col}=$1`, [userId])).rows[0].n);
  }
  return out;
}
