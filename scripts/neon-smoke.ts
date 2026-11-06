/**
 * 실제 Neon DB 연동 점검(가짜 계정 1개): 가입 → 로그아웃 → 로그인 → 암호화 저장·조회 → 탈퇴 → 잔여 행 0건 확인.
 *   vercel env run -- npx vite-node scripts/neon-smoke.ts
 * 시험 계정은 항상 마지막에 삭제한다(공용 DB 안전 규칙 G1-②). 실제 사용자 데이터는 쓰지 않는다.
 */
import { randomBytes } from 'node:crypto';
import { handleAccount } from '../server/account/handler';
import { countRows } from '../server/account/store';
import { getDb } from '../server/db/client';
import { login, logout, prepareSignup, submitSignup, deleteAccount, type Transport } from '../src/features/account/accountClient';
import { decryptRecord, encryptRecord, fromBase64Url, toBase64Url } from '../src/utils/crypto';

const db = getDb(process.env);
if (!db) throw new Error('DATABASE_URL 없음');
const env = { BETTER_AUTH_SECRET: randomBytes(32).toString('hex') };
const jar = new Map<string, string>();
const t: Transport = async (path, body) => {
  const text = JSON.stringify(body ?? {});
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await handleAccount(
    {
      method: 'POST', body: JSON.parse(text), bodyBytes: text.length, ip: '203.0.113.9', path: '/api/account' + path,
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', ...(cookie ? { cookie } : {}) },
    },
    { env, fetch: fetch as never, db },
  );
  for (const c of res.setCookies ?? []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (pair.slice(i + 1) === '' || /max-age=0/i.test(c)) jar.delete(pair.slice(0, i));
    else jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  return { status: res.status, body: res.body as Record<string, unknown> };
};

const email = `smoke-${Date.now()}@example.invalid`;
const pw = 'smoke-test-password-' + randomBytes(4).toString('hex');
const log = (ok: boolean, name: string, extra = '') => console.log(ok ? 'PASS' : 'FAIL', name, extra);
let userId = '';
try {
  const p = await prepareSignup(pw);
  const s = await submitSignup(t, email, p, { aiDataTransfer: false });
  userId = s.userId;
  log(true, '가입(Neon)');
  const enc = await encryptRecord(s.dek, { title: '시험 데이터' }, { table: 'projects', userId, id: 'smoke-1' });
  const push = await t('/sync/push', { items: [{ table: 'projects', id: 'smoke-1', payload: toBase64Url(enc.payload), nonce: toBase64Url(enc.nonce), baseRevision: 0 }] });
  log((push.body.results as { status: string }[])[0].status === 'ok', '암호화 레코드 저장');
  await logout(t);
  const r = await login(t, email, pw);
  const pull = await t('/sync/pull', { since: 0 });
  const row = (pull.body.rows as { payload: string; nonce: string }[])[0];
  const back = await decryptRecord<{ title: string }>(r.dek, { payload: fromBase64Url(row.payload), nonce: fromBase64Url(row.nonce) }, { table: 'projects', userId, id: 'smoke-1' });
  log(back.title === '시험 데이터', '로그아웃 후 재로그인·조회·복호화');
  const raw = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM projects WHERE user_id=$1 AND encode(payload_enc,'escape') LIKE '%시험%'", [userId]);
  log(raw.rows[0].n === 0, 'DB에 평문 없음');
} finally {
  try {
    await deleteAccount(t, email, pw);
  } catch (e) {
    console.log('탈퇴 API 실패 → 직접 정리', (e as Error).message);
    if (userId) await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.query('DELETE FROM "user" WHERE email=$1', [email]);
  }
  const left = userId ? Object.values(await countRows(db, userId)).reduce((a, b) => a + b, 0) : 0;
  const au = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM "user" WHERE email=$1', [email]);
  log(left === 0 && au.rows[0].n === 0, '탈퇴 후 시험 데이터 0건', `(남은 행 ${left}, 로그인 서비스 행 ${au.rows[0].n})`);
  const all = await db.query<{ n: number }>('SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM "user") AS n');
  console.log('공용 DB 전체 사용자 행 수(0이어야 정상):', all.rows[0].n);
}
process.exit(0);
