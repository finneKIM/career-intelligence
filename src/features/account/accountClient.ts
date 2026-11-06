/**
 * 계정 클라이언트 (브라우저). 비밀번호와 데이터 키(DEK)는 이 파일 밖으로, 브라우저 밖으로 나가지 않는다.
 * 서버에는 "로그인용 값"과 감싼 키, 복구 키 소유 증명 값만 보낸다.
 * 네트워크 계층은 Transport 로 주입하므로 서버 핸들러에 직접 연결해 시험할 수 있다.
 */
import {
  KDF_ITERATIONS,
  MIN_PASSWORD_LENGTH,
  createDek,
  derivePasswordKeys,
  fromBase64Url,
  generateRecoveryKey,
  newSalt,
  parseRecoveryKey,
  recoveryProof,
  toBase64Url,
  unwrapDekWithPassword,
  wrapDekWithPassword,
  wrapDekWithRecovery,
} from '../../utils/crypto';

export interface TransportResult {
  status: number;
  body: Record<string, unknown>;
}
export type Transport = (path: string, body: unknown) => Promise<TransportResult>;

export class AccountError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 브라우저 기본 전송: 같은 출처 /api/account/* 로 POST(쿠키 포함) */
export const fetchTransport: Transport = async (path, body) => {
  let res: Response;
  try {
    res = await fetch('/api/account' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AccountError('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.', 0);
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await res.json()) as Record<string, unknown>;
  } catch {
    /* 본문 없음 */
  }
  return { status: res.status, body: parsed };
};

const fail = (r: TransportResult, fallback: string): never => {
  const msg = typeof r.body.error === 'string' ? r.body.error : typeof r.body.message === 'string' ? r.body.message : fallback;
  throw new AccountError(msg, r.status);
};

export const POLICY_VERSION = '2026-11-06-draft';

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  if (password.length > 128) return '비밀번호는 128자 이하여야 합니다.';
  return null;
}

/** 가입 준비: 서버와 통신하지 않고 키를 만든다. 복구 키를 사용자에게 보여 주고 "저장했습니다"를 받은 뒤에만 submitSignup 을 호출한다. */
export interface PreparedSignup {
  userId: string;
  salt: Uint8Array;
  iterations: number;
  dek: CryptoKey;
  recoveryKeyText: string;
  payload: {
    loginSecret: string;
    wrappedDek: string;
    nonce: string;
    recoveryWrappedDek: string;
    recoveryNonce: string;
    recoveryProof: string;
    salt: string;
    iterations: number;
    userId: string;
  };
}

export async function prepareSignup(password: string): Promise<PreparedSignup> {
  const err = validatePassword(password);
  if (err) throw new AccountError(err, 0);
  const userId = crypto.randomUUID();
  const salt = newSalt();
  const keys = await derivePasswordKeys(password, salt, KDF_ITERATIONS);
  const dek = await createDek();
  const w = await wrapDekWithPassword(dek, keys, userId);
  const rec = generateRecoveryKey();
  const rw = await wrapDekWithRecovery(dek, rec.bytes, userId);
  return {
    userId, salt, iterations: KDF_ITERATIONS, dek, recoveryKeyText: rec.text,
    payload: {
      loginSecret: keys.loginSecret, wrappedDek: toBase64Url(w.wrapped), nonce: toBase64Url(w.nonce),
      recoveryWrappedDek: toBase64Url(rw.wrapped), recoveryNonce: toBase64Url(rw.nonce),
      recoveryProof: await recoveryProof(rec.bytes), salt: toBase64Url(salt), iterations: KDF_ITERATIONS, userId,
    },
  };
}

export async function submitSignup(
  t: Transport,
  email: string,
  prepared: PreparedSignup,
  opts: { aiDataTransfer: boolean },
): Promise<{ userId: string; dek: CryptoKey }> {
  const consents = [
    { kind: 'TERMS_OF_SERVICE', policyVersion: POLICY_VERSION },
    { kind: 'PRIVACY_POLICY', policyVersion: POLICY_VERSION },
    ...(opts.aiDataTransfer ? [{ kind: 'AI_DATA_TRANSFER', policyVersion: POLICY_VERSION }] : []),
  ];
  const r = await t('/signup', { email, ...prepared.payload, consents });
  if (r.status !== 200) fail(r, '가입에 실패했습니다.');
  return { userId: prepared.userId, dek: prepared.dek };
}

interface KeysResponse {
  userId: string;
  iterations: number;
  salt: string;
  wrappedDek: string;
  nonce: string;
}

async function unlockFromServer(t: Transport, password: string): Promise<{ userId: string; dek: CryptoKey }> {
  const kr = await t('/keys', {});
  if (kr.status !== 200) fail(kr, '키 정보를 가져오지 못했습니다.');
  const k = kr.body as unknown as KeysResponse;
  const keys = await derivePasswordKeys(password, fromBase64Url(k.salt), k.iterations);
  try {
    const dek = await unwrapDekWithPassword(
      { wrapped: fromBase64Url(k.wrappedDek), nonce: fromBase64Url(k.nonce) }, keys, k.userId,
    );
    return { userId: k.userId, dek };
  } catch {
    throw new AccountError('비밀번호가 올바르지 않습니다.', 401);
  }
}

export async function login(t: Transport, email: string, password: string): Promise<{ userId: string; dek: CryptoKey }> {
  const pre = await t('/prelogin', { email });
  if (pre.status !== 200) fail(pre, '로그인에 실패했습니다.');
  const keys = await derivePasswordKeys(password, fromBase64Url(pre.body.salt as string), pre.body.iterations as number);
  const r = await t('/auth/sign-in/email', { email, password: keys.loginSecret });
  if (r.status !== 200) {
    if (r.status === 429) throw new AccountError('로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429);
    throw new AccountError('이메일 또는 비밀번호가 올바르지 않습니다.', r.status);
  }
  return unlockFromServer(t, password);
}

/** 새로고침 후처럼 서버 세션은 살아 있지만 메모리의 데이터 키가 없을 때: 비밀번호로 다시 잠금 해제 */
export const unlock = unlockFromServer;

export async function currentSession(t: Transport): Promise<string | null> {
  const r = await t('/me', {});
  return r.status === 200 ? (r.body.userId as string) : null;
}

export async function logout(t: Transport): Promise<void> {
  await t('/auth/sign-out', {});
}

export async function changePassword(t: Transport, email: string, current: string, next: string): Promise<void> {
  const err = validatePassword(next);
  if (err) throw new AccountError(err, 0);
  const pre = await t('/prelogin', { email });
  const curKeys = await derivePasswordKeys(current, fromBase64Url(pre.body.salt as string), pre.body.iterations as number);
  const salt = newSalt();
  const nextKeys = await derivePasswordKeys(next, salt, KDF_ITERATIONS);
  const me = await currentSession(t);
  if (!me) throw new AccountError('로그인이 필요합니다.', 401);
  // DEK는 로그인 시 내보내기 불가로 풀렸으므로 서버의 감싼 키를 현재 비밀번호로 다시 풀어 재포장한다
  const kr = await t('/keys', {});
  const k = kr.body as unknown as KeysResponse;
  const extractable = await unwrapDekWithPassword({ wrapped: fromBase64Url(k.wrappedDek), nonce: fromBase64Url(k.nonce) }, curKeys, k.userId, true);
  const w = await wrapDekWithPassword(extractable, nextKeys, k.userId);
  const r = await t('/password', {
    currentLoginSecret: curKeys.loginSecret, newLoginSecret: nextKeys.loginSecret, salt: toBase64Url(salt),
    iterations: KDF_ITERATIONS, wrappedDek: toBase64Url(w.wrapped), nonce: toBase64Url(w.nonce),
  });
  if (r.status !== 200) fail(r, '비밀번호를 바꾸지 못했습니다.');
}

/** 복구 키로 비밀번호 재설정. 복구 키가 맞으면 같은 데이터 키가 새 비밀번호로 다시 감싸져 데이터가 유지된다. */
export async function recoverWithKey(t: Transport, email: string, recoveryKeyText: string, newPassword: string): Promise<void> {
  const err = validatePassword(newPassword);
  if (err) throw new AccountError(err, 0);
  const rec = parseRecoveryKey(recoveryKeyText);
  if (!rec) throw new AccountError('복구 키 형식이 올바르지 않습니다. 52글자(4글자씩 하이픈 구분)를 확인해 주세요.', 0);
  // 복구 키로 감싼 DEK는 서버가 로그인 전에는 내주지 않으므로, 서버 검증을 통과한 뒤에만 재포장이 가능하다 → 2단계
  const challenge = await t('/recover-start', { email, recoveryProof: await recoveryProof(rec) });
  if (challenge.status !== 200) fail(challenge, '복구할 수 없습니다.');
  const { unwrapDekWithRecovery } = await import('../../utils/crypto');
  const userId = challenge.body.userId as string;
  let dek: CryptoKey;
  try {
    dek = await unwrapDekWithRecovery(
      { wrapped: fromBase64Url(challenge.body.recoveryWrappedDek as string), nonce: fromBase64Url(challenge.body.recoveryNonce as string) },
      rec, userId, true,
    );
  } catch {
    throw new AccountError('복구 키가 올바르지 않습니다.', 401);
  }
  const salt = newSalt();
  const keys = await derivePasswordKeys(newPassword, salt, KDF_ITERATIONS);
  const w = await wrapDekWithPassword(dek, keys, userId);
  const r = await t('/recover', {
    email, recoveryProof: await recoveryProof(rec), newLoginSecret: keys.loginSecret, salt: toBase64Url(salt),
    iterations: KDF_ITERATIONS, wrappedDek: toBase64Url(w.wrapped), nonce: toBase64Url(w.nonce),
  });
  if (r.status !== 200) fail(r, '복구할 수 없습니다.');
}

export async function deleteAccount(t: Transport, email: string, password: string): Promise<void> {
  const pre = await t('/prelogin', { email });
  const keys = await derivePasswordKeys(password, fromBase64Url(pre.body.salt as string), pre.body.iterations as number);
  const r = await t('/delete', { loginSecret: keys.loginSecret });
  if (r.status !== 200) fail(r, '계정을 삭제하지 못했습니다.');
}
