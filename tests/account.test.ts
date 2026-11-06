import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb } from './helpers/testDb';
import { handleAccount } from '../server/account/handler';
import { countRows } from '../server/account/store';
import type { Db } from '../server/db/types';
import {
  AccountError, changePassword, deleteAccount, login, logout, prepareSignup, recoverWithKey, submitSignup,
  type Transport,
} from '../src/features/account/accountClient';
import { decryptRecord, encryptRecord, fromBase64Url, toBase64Url } from '../src/utils/crypto';

const ENV = { BETTER_AUTH_SECRET: 'test-secret-'.padEnd(48, 'x') };
let h: Awaited<ReturnType<typeof startTestDb>>;
let db: Db;
beforeAll(async () => {
  h = await startTestDb();
  db = h.db;
}, 60000);
afterAll(() => h.close());

const noNetwork = (async () => {
  throw new Error('no network');
}) as never;

/** 서버 핸들러에 직접 연결하는 전송 계층 + 쿠키 보관(브라우저 흉내) */
function makeClient(ip: string): { t: Transport } {
  const jar = new Map<string, string>();
  const t: Transport = async (path, body) => {
    const text = JSON.stringify(body ?? {});
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await handleAccount(
      {
        method: 'POST', body: JSON.parse(text), bodyBytes: text.length, ip, path: '/api/account' + path,
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
      },
      { env: ENV, fetch: noNetwork, db },
    );
    for (const c of res.setCookies ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (v === '' || /max-age=0/i.test(c)) jar.delete(pair.slice(0, i));
      else jar.set(pair.slice(0, i), v);
    }
    return { status: res.status, body: res.body as Record<string, unknown> };
  };
  return { t };
}
type Client = ReturnType<typeof makeClient>;

const PW = 'correct-horse-battery-1';
const MARK = '극비프로젝트마커XYZ';

async function signUp(c: Client, email: string, pw = PW) {
  const p = await prepareSignup(pw);
  const r = await submitSignup(c.t, email, p, { aiDataTransfer: false });
  return { ...r, recovery: p.recoveryKeyText };
}

async function pushOne(c: Client, userId: string, dek: CryptoKey, table: string, id: string, value: unknown, base = 0) {
  const enc = await encryptRecord(dek, value, { table, userId, id });
  return c.t('/sync/push', { items: [{ table, id, payload: toBase64Url(enc.payload), nonce: toBase64Url(enc.nonce), keyVersion: 1, baseRevision: base }] });
}

type PullRow = { table: string; id: string; payload: string; nonce: string };
const firstRow = async (c: Client) => ((await c.t('/sync/pull', { since: 0 })).body.rows as PullRow[])[0];
const decryptRow = <T>(dek: CryptoKey, row: PullRow, userId: string) =>
  decryptRecord<T>(dek, { payload: fromBase64Url(row.payload), nonce: fromBase64Url(row.nonce) }, { table: row.table, userId, id: row.id });

describe('가입·로그인·복구 (실제 클라이언트 코드 ↔ 서버 핸들러 ↔ 로컬 가짜 DB)', () => {
  const email = 'a@example.test';
  let userId = '';
  let recovery = '';

  it('가입하면 로그아웃·재로그인 후에도 같은 데이터 키로 복호화되어야 합니다', async () => {
    const c = makeClient('10.0.0.1');
    const s = await signUp(c, email);
    userId = s.userId;
    recovery = s.recovery;
    const push = await pushOne(c, userId, s.dek, 'projects', 'p-1', { title: MARK });
    expect((push.body.results as { status: string }[])[0].status).toBe('ok');
    await logout(c.t);
    expect((await c.t('/me', {})).status).toBe(401);

    const c2 = makeClient('10.0.0.2');
    const r = await login(c2.t, email, PW);
    expect((await decryptRow<{ title: string }>(r.dek, await firstRow(c2), userId)).title).toBe(MARK);
  }, 60000);

  it('틀린 비밀번호는 거부하고, 존재하지 않는 계정과 같은 형태로 응답해야 합니다(열거 방지)', async () => {
    const c = makeClient('10.0.0.3');
    const wrongPw = await login(c.t, email, 'wrong-password-123').catch((e: AccountError) => e);
    const noUser = await login(c.t, 'nobody@example.test', 'wrong-password-123').catch((e: AccountError) => e);
    expect(wrongPw).toBeInstanceOf(AccountError);
    expect((wrongPw as AccountError).message).toBe((noUser as AccountError).message);
    expect((wrongPw as AccountError).status).toBe((noUser as AccountError).status);
    const a = (await c.t('/prelogin', { email })).body;
    const b = (await c.t('/prelogin', { email: 'nobody@example.test' })).body;
    expect(Object.keys(a)).toEqual(Object.keys(b));
    expect((a.salt as string).length).toBe((b.salt as string).length);
    expect(b.salt).toBe((await c.t('/prelogin', { email: 'nobody@example.test' })).body.salt); // 가짜 salt도 항상 같음
  }, 60000);

  it('로그인을 5회 넘게 틀리면 429로 제한되어야 합니다', async () => {
    const c = makeClient('10.0.0.4');
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const e = await login(c.t, email, 'wrong-password-' + i).catch((x: AccountError) => x);
      codes.push((e as AccountError).status);
    }
    expect(codes).toContain(429);
  }, 60000);

  it('같은 이메일로 다시 가입할 수 없고, 약한 요청(이용약관 동의 없음·짧은 비밀번호)은 거부해야 합니다', async () => {
    const c = makeClient('10.0.0.5');
    const p = await prepareSignup('another-password-12');
    await expect(submitSignup(c.t, email, p, { aiDataTransfer: false })).rejects.toThrow(/가입할 수 없습니다/);
    await expect(prepareSignup('short')).rejects.toThrow('12자');
    const p2 = await prepareSignup('another-password-12');
    const r = await c.t('/signup', { email: 'noconsent@example.test', ...p2.payload, consents: [] });
    expect(r.status).toBe(400);
  }, 60000);

  it('복구 키로 새 비밀번호를 정하면 옛 데이터가 그대로 복호화되고, 옛 비밀번호는 쓸 수 없어야 합니다', async () => {
    const c = makeClient('10.0.0.6');
    await recoverWithKey(c.t, email, recovery, 'brand-new-password-9');
    await expect(login(makeClient('10.0.0.9').t, email, PW)).rejects.toThrow();
    const cc = makeClient('10.0.0.7');
    const r = await login(cc.t, email, 'brand-new-password-9');
    expect((await decryptRow<{ title: string }>(r.dek, await firstRow(cc), userId)).title).toBe(MARK);
  }, 120000);

  it('틀린 복구 키는 거부하고, 5회 연속 실패하면 올바른 키도 잠겨야 합니다', async () => {
    const c = makeClient('10.0.0.8');
    const fake = 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH-IIII-JJJJ-KKKK-LLLL-MMMM';
    for (let i = 0; i < 5; i++) await expect(recoverWithKey(c.t, email, fake, 'whatever-password-12')).rejects.toThrow();
    await expect(recoverWithKey(c.t, email, recovery, 'whatever-password-12')).rejects.toThrow(/복구할 수 없습니다/);
  }, 120000);

  it('비밀번호를 바꾸면 새 비밀번호로만 로그인되고 데이터는 유지되어야 합니다', async () => {
    const c = makeClient('10.0.1.1');
    const s = await signUp(c, 'pw@example.test');
    await pushOne(c, s.userId, s.dek, 'projects', 'p-9', { title: '유지' });
    await changePassword(c.t, 'pw@example.test', PW, 'changed-password-777');
    await expect(login(makeClient('10.0.1.2').t, 'pw@example.test', PW)).rejects.toThrow();
    const c3 = makeClient('10.0.1.3');
    const r = await login(c3.t, 'pw@example.test', 'changed-password-777');
    expect(r.userId).toBe(s.userId);
    expect((await decryptRow<{ title: string }>(r.dek, await firstRow(c3), s.userId)).title).toBe('유지');
  }, 120000);
});

describe('동기화 서버 규칙', () => {
  it('수정 번호가 낡으면 충돌, 맞으면 갱신되어야 합니다', async () => {
    const c = makeClient('10.0.2.1');
    const s = await signUp(c, 'sync@example.test');
    const first = (await pushOne(c, s.userId, s.dek, 'projects', 'x', { v: 1 })).body.results as { status: string; revision: number }[];
    expect(first[0]).toMatchObject({ status: 'ok', revision: 1 });
    const dup = (await pushOne(c, s.userId, s.dek, 'projects', 'x', { v: 2 }, 0)).body.results as { status: string }[];
    expect(dup[0].status).toBe('conflict');
    const stale = (await pushOne(c, s.userId, s.dek, 'projects', 'x', { v: 2 }, 5)).body.results as { status: string }[];
    expect(stale[0].status).toBe('conflict');
    const ok = (await pushOne(c, s.userId, s.dek, 'projects', 'x', { v: 2 }, 1)).body.results as { status: string; revision: number }[];
    expect(ok[0]).toMatchObject({ status: 'ok', revision: 2 });
  }, 60000);

  it('너무 큰 레코드·알 수 없는 테이블·로그인 없는 요청은 거부해야 합니다', async () => {
    const c = makeClient('10.0.2.2');
    await signUp(c, 'limits@example.test');
    const item = (table: string, size: number) => ({ items: [{ table, id: 'b', payload: toBase64Url(new Uint8Array(size)), nonce: toBase64Url(new Uint8Array(12)), baseRevision: 0 }] });
    expect((await c.t('/sync/push', item('projects', 600_000))).status).toBe(400);
    expect((await c.t('/sync/push', item('users; DROP TABLE users', 20))).status).toBe(400);
    expect((await makeClient('10.0.2.3').t('/sync/pull', { since: 0 })).status).toBe(401);
  }, 60000);
});

describe('격리·평문 부재·탈퇴 (공개 전 필수 시험)', () => {
  it('두 계정은 서로의 데이터를 읽거나 바꿀 수 없고, DB 어디에도 평문이 없어야 합니다', async () => {
    const A = makeClient('10.0.3.1');
    const B = makeClient('10.0.3.2');
    const a = await signUp(A, 'iso-a@example.test');
    const b = await signUp(B, 'iso-b@example.test');
    const SECRET_A = '에이만의비밀문장QWERTY';
    await pushOne(A, a.userId, a.dek, 'projects', 'same-id', { title: SECRET_A });
    await pushOne(A, a.userId, a.dek, 'job_postings', 'jd-1', { company: '에이만의회사' });
    await pushOne(B, b.userId, b.dek, 'projects', 'same-id', { title: 'B의 것' }); // 같은 id 여도 충돌하지 않아야 함

    const pullB = (await B.t('/sync/pull', { since: 0 })).body.rows as PullRow[];
    expect(pullB).toHaveLength(1);
    expect((await decryptRow<{ title: string }>(b.dek, pullB[0], b.userId)).title).toBe('B의 것');
    const pullA = (await A.t('/sync/pull', { since: 0 })).body.rows as PullRow[];
    await expect(decryptRow(b.dek, pullA[0], b.userId)).rejects.toThrow(); // A의 암호문은 B 키로 풀리지 않는다
    await pushOne(B, b.userId, b.dek, 'projects', 'same-id', { title: 'B 수정' }, 1);
    const projA = pullA.find((r) => r.table === 'projects')!;
    expect((await decryptRow<{ title: string }>(a.dek, projA, a.userId)).title).toBe(SECRET_A); // B의 갱신은 A의 행에 영향 없음

    const tables = (await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map((r) => r.tablename);
    const needles = [SECRET_A, '에이만의회사', MARK, PW, 'brand-new-password-9'];
    for (const t of tables) {
      const dump = (await db.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM "${t}" x`)).rows.map((r) => r.j).join('\n');
      for (const n of needles) {
        expect(dump, `${t} 에 평문 ${n}`).not.toContain(n);
        expect(dump.toLowerCase(), `${t} 에 평문(hex) ${n}`).not.toContain(Buffer.from(n).toString('hex'));
      }
    }
  }, 120000);

  it('탈퇴하면 모든 테이블에서 해당 사용자의 행이 0건이고, 다른 사용자는 영향이 없어야 합니다', async () => {
    const A = makeClient('10.0.4.1');
    const B = makeClient('10.0.4.2');
    const a = await signUp(A, 'del-a@example.test');
    const b = await signUp(B, 'del-b@example.test');
    for (const t of ['projects', 'profiles', 'source_documents', 'job_postings', 'applications', 'analysis_results', 'company_materials', 'generated_documents']) {
      await pushOne(A, a.userId, a.dek, t, 'r1', { t });
    }
    await pushOne(B, b.userId, b.dek, 'projects', 'r1', { t: 'b' });
    const before = await countRows(db, a.userId);
    expect(Object.values(before).reduce((x, y) => x + y, 0)).toBeGreaterThan(8);

    await expect(deleteAccount(A.t, 'del-a@example.test', 'wrong-password-123')).rejects.toThrow();
    await deleteAccount(A.t, 'del-a@example.test', PW);

    const after = await countRows(db, a.userId);
    expect(Object.values(after).every((n) => n === 0), JSON.stringify(after)).toBe(true);
    const auth = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "user" WHERE email='del-a@example.test'`);
    expect(auth.rows[0].n).toBe(0);
    expect((await A.t('/me', {})).status).toBe(401);
    await expect(login(makeClient('10.0.4.3').t, 'del-a@example.test', PW)).rejects.toThrow();
    expect(Object.values(await countRows(db, b.userId)).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
  }, 120000);

  it('인증 비밀 값이 없으면 계정 기능은 503 이어야 합니다', async () => {
    const res = await handleAccount(
      { method: 'POST', body: {}, bodyBytes: 2, path: '/api/account/prelogin', headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } },
      { env: {}, fetch: noNetwork, db },
    );
    expect(res.status).toBe(503);
  });
});
