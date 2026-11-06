import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ACCOUNT_BODY_LIMIT, guardRequest, json, type ApiRequest, type ApiResponse, type HandlerDeps } from '../http.js';
import { getDb } from '../db/client.js';
import { withTx, type Db } from '../db/types.js';
import { AUTH_BASE_PATH, createAuth, type Auth } from './auth.js';
import {
  SYNC_TABLES,
  createAccountRows,
  deleteAccountRows,
  findUserIdByAuthSubject,
  getKeys,
  getKeysByEmail,
  getRecoveryState,
  pullChanges,
  purgeTombstones,
  pushItem,
  recordRecoveryFailure,
  replaceWrappedKey,
  tableDef,
  type PushItem,
} from './store.js';

/**
 * 계정·동기화 API — Vercel 함수 1개(/api/account)가 하위 경로를 나눠 처리한다(무료 플랜 함수 12개 한도).
 * 모든 요청은 POST. 사용자 데이터는 브라우저가 암호화한 값만 오가며 서버는 내용을 해석하지 않는다.
 */
export interface AccountDeps extends HandlerDeps {
  db?: Db;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const B64U_RE = /^[A-Za-z0-9_-]*$/;
const AUTH_PASSTHROUGH = new Set(['/sign-in/email', '/sign-out']);
const POLICY_VERSION_RE = /^[\w.\-]{1,64}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const bad = (msg = '요청 형식이 올바르지 않습니다.') => json(400, { error: msg });

function bytes(v: unknown, min: number, max: number): Buffer | null {
  if (typeof v !== 'string' || !B64U_RE.test(v) || v.length > Math.ceil((max * 4) / 3) + 2) return null;
  const b = Buffer.from(v, 'base64url');
  return b.length >= min && b.length <= max ? b : null;
}
const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');

const authCache = new WeakMap<Db, Map<string, Auth>>();
function getAuth(db: Db, env: HandlerDeps['env'], baseURL: string): Auth | null {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  let m = authCache.get(db);
  if (!m) authCache.set(db, (m = new Map()));
  let a = m.get(baseURL);
  if (!a) m.set(baseURL, (a = createAuth(db, { secret, baseURL })));
  return a;
}

function baseUrlOf(req: ApiRequest): string {
  const host = req.headers['host'] ?? 'localhost';
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

function toWebRequest(req: ApiRequest, baseURL: string, path: string, body: unknown): Request {
  const h = new Headers({ 'content-type': 'application/json' });
  for (const k of ['cookie', 'origin', 'x-forwarded-for', 'user-agent']) if (req.headers[k]) h.set(k, req.headers[k]!);
  if (!h.has('origin')) h.set('origin', baseURL);
  return new Request(baseURL + path, { method: 'POST', headers: h, body: JSON.stringify(body ?? {}) });
}

async function fromWebResponse(res: Response): Promise<{ status: number; body: unknown; setCookies: string[] }> {
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, body, setCookies: res.headers.getSetCookie?.() ?? [] };
}

/** 존재하지 않는 계정에도 같은 모양의 salt를 돌려주기 위한 결정적 가짜 salt(계정 존재 여부 노출 방지) */
const fakeSalt = (secret: string, email: string) =>
  createHmac('sha256', secret).update(`prelogin-salt:${email.trim().toLowerCase()}`).digest().subarray(0, 16);

async function requireSession(req: ApiRequest, auth: Auth, db: Db) {
  const h = new Headers();
  if (req.headers['cookie']) h.set('cookie', req.headers['cookie']!);
  const s = await auth.api.getSession({ headers: h });
  if (!s?.user?.id) return null;
  const userId = await findUserIdByAuthSubject(db, s.user.id);
  return userId ? { userId, authId: s.user.id } : null;
}

export async function handleAccount(req: ApiRequest, deps: AccountDeps): Promise<ApiResponse> {
  const { env } = deps;
  const denied = guardRequest(req, env, { requireAccessCode: false, maxBytes: ACCOUNT_BODY_LIMIT });
  if (denied) return denied;

  const db = deps.db ?? getDb(env);
  if (!db) return json(503, { error: '계정 기능이 아직 설정되지 않았습니다(DB 연결 없음).' });
  const baseURL = baseUrlOf(req);
  const auth = getAuth(db, env, baseURL);
  if (!auth) return json(503, { error: '계정 기능이 아직 설정되지 않았습니다(인증 비밀 값 없음).' });

  const sub = (req.path ?? '').replace(/^\/api\/account/, '') || '/';
  const body = isObj(req.body) ? req.body : {};

  try {
    // ---- 로그인 서비스 경로 중 허용한 것만 통과 ----
    if (sub.startsWith('/auth/')) {
      const inner = sub.slice('/auth'.length);
      if (!AUTH_PASSTHROUGH.has(inner)) return json(404, { error: 'Not found' });
      const out = await fromWebResponse(await auth.handler(toWebRequest(req, baseURL, AUTH_BASE_PATH + inner, body)));
      return { status: out.status, body: out.body, setCookies: out.setCookies };
    }

    switch (sub) {
      case '/prelogin': {
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        if (!EMAIL_RE.test(email)) return bad();
        const found = await getKeysByEmail(db, email);
        const salt = found ? found.salt : fakeSalt(env.BETTER_AUTH_SECRET!, email);
        return json(200, { salt: b64(salt), iterations: found?.iterations ?? 600000 });
      }

      case '/signup': {
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const userId = typeof body.userId === 'string' ? body.userId : '';
        const loginSecret = typeof body.loginSecret === 'string' ? body.loginSecret : '';
        const iterations = Number(body.iterations);
        const salt = bytes(body.salt, 16, 64);
        const wrappedDek = bytes(body.wrappedDek, 17, 200);
        const nonce = bytes(body.nonce, 12, 12);
        const recoveryWrappedDek = bytes(body.recoveryWrappedDek, 17, 200);
        const recoveryNonce = bytes(body.recoveryNonce, 12, 12);
        const proof = bytes(body.recoveryProof, 32, 32);
        const consents = Array.isArray(body.consents) ? body.consents : [];
        if (!EMAIL_RE.test(email) || !UUID_RE.test(userId) || loginSecret.length !== 43 || !B64U_RE.test(loginSecret)) return bad();
        if (!Number.isInteger(iterations) || iterations < 600000 || iterations > 5_000_000) return bad();
        if (!salt || !wrappedDek || !nonce || !recoveryWrappedDek || !recoveryNonce || !proof) return bad();
        const kinds = new Set<string>();
        const cs: { kind: string; policyVersion: string }[] = [];
        for (const c of consents) {
          if (!isObj(c) || typeof c.kind !== 'string' || typeof c.policyVersion !== 'string' || !POLICY_VERSION_RE.test(c.policyVersion)) return bad();
          if (!['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'AI_DATA_TRANSFER'].includes(c.kind)) return bad();
          kinds.add(c.kind);
          cs.push({ kind: c.kind, policyVersion: c.policyVersion });
        }
        if (!kinds.has('TERMS_OF_SERVICE') || !kinds.has('PRIVACY_POLICY')) return bad('이용약관과 개인정보 처리방침에 동의해야 가입할 수 있습니다.');

        const out = await fromWebResponse(
          await auth.handler(toWebRequest(req, baseURL, `${AUTH_BASE_PATH}/sign-up/email`, { email, password: loginSecret, name: 'user' })),
        );
        if (out.status === 429) return { status: 429, body: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, setCookies: [] };
        const authId = (out.body as { user?: { id?: string } }).user?.id;
        if (out.status !== 200 || !authId) return json(out.status === 422 ? 409 : 400, { error: '가입할 수 없습니다. 이미 가입된 이메일이거나 입력이 올바르지 않습니다.' });
        try {
          await withTx(db, (tx) =>
            createAccountRows(tx, {
              userId, authSubject: authId, iterations, salt, wrappedDek, nonce, recoveryWrappedDek, recoveryNonce,
              recoveryVerifier: createHash('sha256').update(proof).digest(), consents: cs,
            }),
          );
        } catch {
          await db.query('DELETE FROM "user" WHERE id = $1', [authId]); // 보상: 반쪽 계정을 남기지 않는다
          return json(409, { error: '가입할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
        }
        return { status: 200, body: { userId }, setCookies: out.setCookies };
      }

      case '/keys': {
        const me = await requireSession(req, auth, db);
        if (!me) return json(401, { error: '로그인이 필요합니다.' });
        const k = await getKeys(db, me.userId);
        if (!k) return json(404, { error: '키 정보를 찾을 수 없습니다.' });
        return json(200, {
          userId: me.userId, iterations: k.kdf_iterations, salt: b64(k.kdf_salt), wrappedDek: b64(k.wrapped_dek),
          nonce: b64(k.wrapped_dek_nonce), keyVersion: k.key_version,
        });
      }

      case '/me': {
        const me = await requireSession(req, auth, db);
        return me ? json(200, { userId: me.userId }) : json(401, { error: '로그인이 필요합니다.' });
      }

      case '/password': {
        const me = await requireSession(req, auth, db);
        if (!me) return json(401, { error: '로그인이 필요합니다.' });
        const cur = typeof body.currentLoginSecret === 'string' ? body.currentLoginSecret : '';
        const next = typeof body.newLoginSecret === 'string' ? body.newLoginSecret : '';
        const iterations = Number(body.iterations);
        const salt = bytes(body.salt, 16, 64);
        const wrappedDek = bytes(body.wrappedDek, 17, 200);
        const nonce = bytes(body.nonce, 12, 12);
        if (cur.length !== 43 || next.length !== 43 || !salt || !wrappedDek || !nonce || !Number.isInteger(iterations) || iterations < 600000) return bad();
        const h = new Headers();
        h.set('cookie', req.headers['cookie'] ?? '');
        try {
          await auth.api.changePassword({ body: { currentPassword: cur, newPassword: next, revokeOtherSessions: true }, headers: h });
        } catch {
          return json(401, { error: '현재 비밀번호가 올바르지 않습니다.' });
        }
        await replaceWrappedKey(db, me.userId, { iterations, salt, wrappedDek, nonce });
        return json(200, { ok: true });
      }

      case '/recover-start':
      case '/recover': {
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const proof = bytes(body.recoveryProof, 32, 32);
        const start = sub === '/recover-start';
        const next = typeof body.newLoginSecret === 'string' ? body.newLoginSecret : '';
        const iterations = Number(body.iterations);
        const salt = bytes(body.salt, 16, 64);
        const wrappedDek = bytes(body.wrappedDek, 17, 200);
        const nonce = bytes(body.nonce, 12, 12);
        if (!EMAIL_RE.test(email) || !proof) return bad();
        if (!start && (next.length !== 43 || !salt || !wrappedDek || !nonce || !Number.isInteger(iterations) || iterations < 600000)) return bad();
        const GENERIC = json(401, { error: '복구할 수 없습니다. 이메일 또는 복구 키를 확인해 주세요. (연속 실패 시 15분간 잠깁니다)' });
        const found = await getKeysByEmail(db, email);
        if (!found) return GENERIC;
        const st = await getRecoveryState(db, found.userId);
        if (!st || st.locked) return GENERIC;
        const given = createHash('sha256').update(proof).digest();
        if (given.length !== st.recovery_verifier.length || !timingSafeEqual(given, st.recovery_verifier)) {
          await recordRecoveryFailure(db, found.userId);
          return GENERIC;
        }
        if (start) {
          return json(200, { userId: found.userId, recoveryWrappedDek: b64(st.recovery_wrapped_dek), recoveryNonce: b64(st.recovery_nonce) });
        }
        const ctx = await auth.$context;
        const hash = await ctx.password.hash(next);
        await withTx(db, async (tx) => {
          await tx.query(`UPDATE account SET password=$1, "updatedAt"=now() WHERE "userId"=$2 AND "providerId"='credential'`, [hash, found.authId]);
          await tx.query('DELETE FROM session WHERE "userId"=$1', [found.authId]);
          await replaceWrappedKey(tx, found.userId, { iterations, salt: salt!, wrappedDek: wrappedDek!, nonce: nonce! });
        });
        return json(200, { ok: true });
      }

      case '/delete': {
        const me = await requireSession(req, auth, db);
        if (!me) return json(401, { error: '로그인이 필요합니다.' });
        const secret = typeof body.loginSecret === 'string' ? body.loginSecret : '';
        const acc = await db.query<{ password: string | null }>(`SELECT password FROM account WHERE "userId"=$1 AND "providerId"='credential'`, [me.authId]);
        const ctx = await auth.$context;
        const ok = !!acc.rows[0]?.password && secret.length === 43 && (await ctx.password.verify({ hash: acc.rows[0].password!, password: secret }));
        if (!ok) return json(401, { error: '비밀번호가 올바르지 않습니다.' });
        await withTx(db, (tx) => deleteAccountRows(tx, me.userId, me.authId));
        return json(200, { ok: true }, undefined);
      }

      case '/sync/pull': {
        const me = await requireSession(req, auth, db);
        if (!me) return json(401, { error: '로그인이 필요합니다.' });
        const since = Math.max(0, Math.floor(Number(body.since) || 0));
        const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 50)));
        const r = await pullChanges(db, me.userId, since, limit);
        return json(200, {
          hasMore: r.hasMore,
          rows: r.rows.map((x) => ({
            table: x.table, id: x.id, payload: b64(x.payload), nonce: b64(x.nonce),
            contact: x.contact ? b64(x.contact) : null, contactNonce: x.contactNonce ? b64(x.contactNonce) : null,
            keyVersion: x.keyVersion, revision: x.revision, seq: x.seq, deleted: x.deleted,
          })),
        });
      }

      case '/sync/push': {
        const me = await requireSession(req, auth, db);
        if (!me) return json(401, { error: '로그인이 필요합니다.' });
        const items = Array.isArray(body.items) ? body.items : null;
        if (!items || items.length === 0 || items.length > 50) return bad();
        const parsed: PushItem[] = [];
        for (const it of items) {
          if (!isObj(it) || typeof it.table !== 'string' || typeof it.id !== 'string') return bad();
          const def = tableDef(it.table);
          if (!def || it.id.length < 1 || it.id.length > 100) return bad();
          const payload = bytes(it.payload, 17, def.maxPayload);
          const nonce = bytes(it.nonce, 12, 12);
          if (!payload || !nonce) return bad('레코드가 너무 크거나 형식이 올바르지 않습니다.');
          let contact: Buffer | null = null;
          let contactNonce: Buffer | null = null;
          if (def.hasContact && it.contact) {
            contact = bytes(it.contact, 17, 32768);
            contactNonce = bytes(it.contactNonce, 12, 12);
            if (!contact || !contactNonce) return bad();
          } else if (it.contact) return bad();
          const baseRevision = Math.floor(Number(it.baseRevision));
          if (!Number.isInteger(baseRevision) || baseRevision < 0) return bad();
          parsed.push({ table: def.name, id: it.id, payload, nonce, contact, contactNonce, keyVersion: Math.max(1, Math.floor(Number(it.keyVersion) || 1)), baseRevision, deleted: it.deleted === true });
        }
        const results = [];
        for (const p of parsed) results.push(await pushItem(db, me.userId, p));
        void purgeTombstones(db, me.userId).catch(() => undefined);
        return json(200, { results });
      }

      case '/sync/tables':
        return json(200, { tables: SYNC_TABLES.map((t) => t.name) });
    }
    return json(404, { error: 'Not found' });
  } catch {
    // 내부 오류에는 암호문·토큰이 섞일 수 있으므로 상세 내용을 응답·로그에 남기지 않는다.
    return json(500, { error: '서버 내부 오류가 발생했습니다.' });
  }
}
