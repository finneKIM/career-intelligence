/**
 * 키 파생·감싸기 (B 방식: 서버는 비밀번호도 데이터 키도 알 수 없다).
 *
 * 비밀번호 --PBKDF2-SHA256(≥600,000회)--> 마스터 --HKDF--> ① 로그인용 값(서버로 보냄) ② 열쇠용 값(브라우저 밖으로 안 나감)
 * 무작위 데이터 키(DEK)는 ② 로 감싸 서버에 보관한다. 복구 키(무작위 256비트)로도 한 번 더 감싼다.
 * 표준 WebCrypto 함수만 사용하며 직접 만든 암호 알고리즘은 없다.
 */
import { fromBase32, randomBytes, toBase32, toBase64Url, utf8 } from './encoding';

export const KDF_ALGORITHM = 'PBKDF2-SHA256';
/** OWASP 권장(PBKDF2-HMAC-SHA256 ≥ 600,000회) */
export const KDF_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const NONCE_BYTES = 12;
export const MIN_PASSWORD_LENGTH = 12;

const INFO_LOGIN = 'ci/login/v1';
const INFO_WRAP = 'ci/wrap/v1';
const INFO_RECOVERY = 'ci/recovery-wrap/v1';
const INFO_RECOVERY_AUTH = 'ci/recovery-auth/v1';

export interface WrappedKey {
  wrapped: Uint8Array; // 암호문 + 16바이트 태그
  nonce: Uint8Array; // 12바이트
}

const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** 시험·표준 벡터 확인용으로 공개 */
export async function pbkdf2Bits(password: Uint8Array, salt: Uint8Array, iterations: number, bits: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', buf(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(
    await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations }, key, bits),
  );
}

export async function hkdfBits(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, bits),
  );
}

const aesKey = (raw: Uint8Array, extractable: boolean) =>
  subtle().importKey('raw', buf(raw), 'AES-GCM', extractable, ['encrypt', 'decrypt']);

export interface PasswordKeys {
  /** 서버(로그인 서비스)에 비밀번호로 보내는 값. 열쇠용 값과 서로 계산할 수 없다. */
  loginSecret: string;
  /** DEK를 감싸는 열쇠. 브라우저 밖으로 내보낼 수 없음(non-extractable). */
  wrapKey: CryptoKey;
}

export const normalizePassword = (password: string): Uint8Array => utf8(password.normalize('NFKC'));

export async function derivePasswordKeys(
  password: string,
  salt: Uint8Array,
  iterations: number = KDF_ITERATIONS,
): Promise<PasswordKeys> {
  const master = await pbkdf2Bits(normalizePassword(password), salt, iterations, 256);
  const empty = new Uint8Array(0);
  const login = await hkdfBits(master, empty, utf8(INFO_LOGIN), 256);
  const wrap = await hkdfBits(master, empty, utf8(INFO_WRAP), 256);
  master.fill(0);
  const wrapKey = await aesKey(wrap, false);
  wrap.fill(0);
  return { loginSecret: toBase64Url(login), wrapKey };
}

export const newSalt = (): Uint8Array => randomBytes(SALT_BYTES);

/** 무작위 데이터 키(DEK). 감싸야 하므로 생성 직후에는 내보내기 가능. */
export const createDek = (): Promise<CryptoKey> =>
  subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

const dekAad = (userId: string, purpose: 'password' | 'recovery') => utf8(`ci|v1|dek|${userId}|${purpose}`);

async function wrapWith(dek: CryptoKey, kek: CryptoKey, aad: Uint8Array): Promise<WrappedKey> {
  const raw = new Uint8Array(await subtle().exportKey('raw', dek));
  const nonce = randomBytes(NONCE_BYTES);
  const wrapped = new Uint8Array(
    await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce), additionalData: buf(aad) }, kek, buf(raw)),
  );
  raw.fill(0);
  return { wrapped, nonce };
}

async function unwrapWith(w: WrappedKey, kek: CryptoKey, aad: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  const raw = new Uint8Array(
    await subtle().decrypt({ name: 'AES-GCM', iv: buf(w.nonce), additionalData: buf(aad) }, kek, buf(w.wrapped)),
  );
  try {
    return await aesKey(raw, extractable);
  } finally {
    raw.fill(0);
  }
}

export const wrapDekWithPassword = (dek: CryptoKey, keys: PasswordKeys, userId: string) =>
  wrapWith(dek, keys.wrapKey, dekAad(userId, 'password'));
export const unwrapDekWithPassword = (w: WrappedKey, keys: PasswordKeys, userId: string, extractable = false) =>
  unwrapWith(w, keys.wrapKey, dekAad(userId, 'password'), extractable);

// ---- 복구 키 ----
export const RECOVERY_KEY_BYTES = 32;

/** 사람이 옮겨 적기 쉬운 형식: base32를 4글자씩 하이픈으로 구분 (52글자 → 13묶음) */
export const formatRecoveryKey = (bytes: Uint8Array): string => toBase32(bytes).match(/.{1,4}/g)!.join('-');

export function generateRecoveryKey(): { bytes: Uint8Array; text: string } {
  const bytes = randomBytes(RECOVERY_KEY_BYTES);
  return { bytes, text: formatRecoveryKey(bytes) };
}

/** 사용자가 입력한 복구 키 문자열 → 바이트. 형식이 틀리면 null */
export function parseRecoveryKey(text: string): Uint8Array | null {
  const bytes = fromBase32(text.toUpperCase().replace(/[\s-]/g, ''));
  return bytes && bytes.length === RECOVERY_KEY_BYTES ? bytes : null;
}

async function recoveryKek(bytes: Uint8Array): Promise<CryptoKey> {
  const raw = await hkdfBits(bytes, new Uint8Array(0), utf8(INFO_RECOVERY), 256);
  const k = await aesKey(raw, false);
  raw.fill(0);
  return k;
}
export const wrapDekWithRecovery = async (dek: CryptoKey, recovery: Uint8Array, userId: string) =>
  wrapWith(dek, await recoveryKek(recovery), dekAad(userId, 'recovery'));
export const unwrapDekWithRecovery = async (w: WrappedKey, recovery: Uint8Array, userId: string, extractable = false) =>
  unwrapWith(w, await recoveryKek(recovery), dekAad(userId, 'recovery'), extractable);

/**
 * 복구 키 소유 증명 값. 복구 키에서 열쇠와는 따로 파생하며(서로 계산 불가), 서버는 이 값의 SHA-256만 보관한다.
 * 복구 키로 비밀번호를 다시 정할 때 서버에 제시해 "복구 키를 가진 사람"임을 증명한다.
 */
export async function recoveryProof(recovery: Uint8Array): Promise<string> {
  return toBase64Url(await hkdfBits(recovery, new Uint8Array(0), utf8(INFO_RECOVERY_AUTH), 256));
}
