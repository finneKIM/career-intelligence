/**
 * 레코드 암호화 (AES-256-GCM). 서버 DB에는 payload(암호문+태그)와 nonce(12바이트)만 저장된다.
 * AAD = 버전|테이블|user_id|id|칸 이름 → 다른 행·다른 칸·다른 사용자에게 암호문을 옮겨 붙이면 복호화가 실패한다.
 */
import { fromUtf8, randomBytes, utf8 } from './encoding';
import { NONCE_BYTES } from './keys';

export interface RecordContext {
  table: string;
  userId: string;
  id: string;
  /** 같은 행의 칸을 구분(예: 'payload' | 'contact') */
  field?: string;
}
export interface EncryptedRecord {
  payload: Uint8Array;
  nonce: Uint8Array;
  keyVersion: number;
}

const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
export const recordAad = (c: RecordContext): Uint8Array =>
  utf8(`ci|v1|rec|${c.table}|${c.userId}|${c.id}|${c.field ?? 'payload'}`);

export async function encryptRecord(dek: CryptoKey, value: unknown, ctx: RecordContext, keyVersion = 1): Promise<EncryptedRecord> {
  const nonce = randomBytes(NONCE_BYTES);
  const payload = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: buf(nonce), additionalData: buf(recordAad(ctx)) },
      dek,
      buf(utf8(JSON.stringify(value))),
    ),
  );
  return { payload, nonce, keyVersion };
}

/** 키·AAD·내용 중 하나라도 다르면 예외(복호화 실패) */
export async function decryptRecord<T = unknown>(
  dek: CryptoKey,
  rec: Pick<EncryptedRecord, 'payload' | 'nonce'>,
  ctx: RecordContext,
): Promise<T> {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: buf(rec.nonce), additionalData: buf(recordAad(ctx)) },
      dek,
      buf(rec.payload),
    ),
  );
  return JSON.parse(fromUtf8(plain)) as T;
}
