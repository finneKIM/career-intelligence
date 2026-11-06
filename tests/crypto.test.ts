import { describe, it, expect } from 'vitest';
import {
  KDF_ITERATIONS,
  createDek,
  decryptRecord,
  derivePasswordKeys,
  encryptRecord,
  fromHex,
  generateRecoveryKey,
  hkdfBits,
  newSalt,
  parseRecoveryKey,
  pbkdf2Bits,
  toHex,
  unwrapDekWithPassword,
  unwrapDekWithRecovery,
  utf8,
  wrapDekWithPassword,
  wrapDekWithRecovery,
  fromBase32,
  toBase32,
} from '../src/utils/crypto';

const FAST = 1000; // 시험 속도용. 실제 상수는 아래 시험에서 600,000 이상임을 확인
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ctx = (over = {}) => ({ table: 'projects', userId: USER, id: 'p1', ...over });

describe('표준 테스트 벡터', () => {
  it('PBKDF2-HMAC-SHA256 ("passwd","salt",c=1,dkLen=64) — RFC 7914 §11', async () => {
    const out = await pbkdf2Bits(utf8('passwd'), utf8('salt'), 1, 512);
    expect(toHex(out)).toBe(
      '55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783',
    );
  });

  it('HKDF-SHA256 — RFC 5869 Test Case 1', async () => {
    const ikm = fromHex('0b'.repeat(22));
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    expect(toHex(await hkdfBits(ikm, salt, info, 42 * 8))).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('반복 횟수 상수는 OWASP 권장(600,000) 이상이어야 합니다', () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });
});

describe('비밀번호 파생', () => {
  it('같은 비밀번호·salt는 같은 값, 다르면 다른 값이어야 합니다', async () => {
    const salt = newSalt();
    const a = await derivePasswordKeys('correct horse battery', salt, FAST);
    const b = await derivePasswordKeys('correct horse battery', salt, FAST);
    const c = await derivePasswordKeys('correct horse batterz', salt, FAST);
    const d = await derivePasswordKeys('correct horse battery', newSalt(), FAST);
    expect(a.loginSecret).toBe(b.loginSecret);
    expect(a.loginSecret).not.toBe(c.loginSecret);
    expect(a.loginSecret).not.toBe(d.loginSecret);
    expect(a.loginSecret).toHaveLength(43);
  });

  it('열쇠는 내보낼 수 없고, 로그인용 값으로는 열쇠를 만들 수 없어야 합니다(독립성)', async () => {
    const salt = newSalt();
    const k = await derivePasswordKeys('pw-독립성-시험-1234', salt, FAST);
    expect(k.wrapKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', k.wrapKey)).rejects.toThrow();
    // 서버가 아는 로그인용 값을 비밀번호처럼 다시 파생해도 같은 열쇠가 나오지 않는다
    const dek = await createDek();
    const w = await wrapDekWithPassword(dek, k, USER);
    const forged = await derivePasswordKeys(k.loginSecret, salt, FAST);
    await expect(unwrapDekWithPassword(w, forged, USER)).rejects.toThrow();
  });

  it('유니코드 정규화(NFKC)로 같은 비밀번호의 다른 표기를 같게 취급해야 합니다', async () => {
    const salt = newSalt();
    const a = await derivePasswordKeys('Ａbc-비밀번호-1234', salt, FAST); // 전각 A
    const b = await derivePasswordKeys('Abc-비밀번호-1234', salt, FAST);
    expect(a.loginSecret).toBe(b.loginSecret);
  });
});

describe('데이터 키(DEK) 감싸기', () => {
  it('비밀번호 경로 왕복 성공, 틀린 비밀번호·다른 사용자 ID는 실패해야 합니다', async () => {
    const salt = newSalt();
    const keys = await derivePasswordKeys('pw-정상-비밀번호-1', salt, FAST);
    const dek = await createDek();
    const w = await wrapDekWithPassword(dek, keys, USER);
    const back = await unwrapDekWithPassword(w, keys, USER, true);
    const sample = await encryptRecord(dek, { a: 1 }, ctx());
    expect(await decryptRecord(back, sample, ctx())).toEqual({ a: 1 });
    const wrong = await derivePasswordKeys('pw-틀린-비밀번호-1', salt, FAST);
    await expect(unwrapDekWithPassword(w, wrong, USER)).rejects.toThrow();
    await expect(unwrapDekWithPassword(w, keys, OTHER)).rejects.toThrow();
  });

  it('감싼 키의 한 비트만 바뀌어도 풀리지 않아야 합니다', async () => {
    const keys = await derivePasswordKeys('pw-변조-시험-1234', newSalt(), FAST);
    const w = await wrapDekWithPassword(await createDek(), keys, USER);
    const tampered = { ...w, wrapped: Uint8Array.from(w.wrapped) };
    tampered.wrapped[0] ^= 1;
    await expect(unwrapDekWithPassword(tampered, keys, USER)).rejects.toThrow();
  });

  it('복구 키 왕복 성공, 다른 복구 키는 실패, 복구 후 새 비밀번호로 다시 감쌀 수 있어야 합니다', async () => {
    const dek = await createDek();
    const rec = generateRecoveryKey();
    const w = await wrapDekWithRecovery(dek, rec.bytes, USER);
    const parsed = parseRecoveryKey(rec.text.toLowerCase());
    expect(parsed).not.toBeNull();
    const back = await unwrapDekWithRecovery(w, parsed!, USER, true);
    const newKeys = await derivePasswordKeys('새-비밀번호-1234-abcd', newSalt(), FAST);
    const rewrapped = await wrapDekWithPassword(back, newKeys, USER);
    const again = await unwrapDekWithPassword(rewrapped, newKeys, USER);
    const probe = await encryptRecord(dek, 'hello', ctx());
    expect(await decryptRecord(again, probe, ctx())).toBe('hello');
    await expect(unwrapDekWithRecovery(w, generateRecoveryKey().bytes, USER)).rejects.toThrow();
  });

  it('복구 키 없이 비밀번호를 새로 만들면 옛 데이터는 복호화되지 않아야 합니다(예상 동작)', async () => {
    const oldDek = await createDek();
    const old = await encryptRecord(oldDek, '옛 데이터', ctx());
    const brandNewDek = await createDek();
    await expect(decryptRecord(brandNewDek, old, ctx())).rejects.toThrow();
  });
});

describe('복구 키 형식', () => {
  it('52글자 base32를 4글자씩 하이픈으로 구분하고, 공백·소문자·하이픈 위치가 달라도 읽혀야 합니다', () => {
    const { bytes, text } = generateRecoveryKey();
    expect(text).toMatch(/^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
    expect(parseRecoveryKey(text.replace(/-/g, ' ').toLowerCase())).toEqual(bytes);
    expect(parseRecoveryKey(text.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey('!!!!-' + text.slice(5))).toBeNull();
  });

  it('base32 변환은 표준 예시와 왕복이 맞아야 합니다 (RFC 4648: "foobar" → MZXW6YTBOI)', () => {
    expect(toBase32(utf8('foobar'))).toBe('MZXW6YTBOI');
    expect(new TextDecoder().decode(fromBase32('MZXW6YTBOI')!)).toBe('foobar');
  });
});

describe('레코드 암호화', () => {
  it('왕복 성공하고 같은 평문도 매번 다른 암호문·nonce여야 합니다', async () => {
    const dek = await createDek();
    const v = { title: '프로젝트', outcomes: ['성과 1', '성과 2'] };
    const a = await encryptRecord(dek, v, ctx());
    const b = await encryptRecord(dek, v, ctx());
    expect(await decryptRecord(dek, a, ctx())).toEqual(v);
    expect(toHex(a.nonce)).not.toBe(toHex(b.nonce));
    expect(toHex(a.payload)).not.toBe(toHex(b.payload));
    expect(a.nonce).toHaveLength(12);
  });

  it('암호문에 평문이 그대로 보이지 않아야 합니다', async () => {
    const dek = await createDek();
    const r = await encryptRecord(dek, { company: '비밀회사명ABC' }, ctx());
    expect(Buffer.from(r.payload).toString('latin1')).not.toContain('비밀회사명');
    expect(Buffer.from(r.payload).toString('utf8')).not.toContain('ABC');
  });

  it('한 비트 변조·다른 키·다른 행/칸/테이블/사용자 문맥으로는 복호화되지 않아야 합니다', async () => {
    const dek = await createDek();
    const r = await encryptRecord(dek, 'x', ctx());
    const t = { ...r, payload: Uint8Array.from(r.payload) };
    t.payload[t.payload.length - 1] ^= 1;
    await expect(decryptRecord(dek, t, ctx())).rejects.toThrow();
    await expect(decryptRecord(await createDek(), r, ctx())).rejects.toThrow();
    await expect(decryptRecord(dek, r, ctx({ id: 'p2' }))).rejects.toThrow();
    await expect(decryptRecord(dek, r, ctx({ field: 'contact' }))).rejects.toThrow();
    await expect(decryptRecord(dek, r, ctx({ table: 'profiles' }))).rejects.toThrow();
    await expect(decryptRecord(dek, r, ctx({ userId: OTHER }))).rejects.toThrow();
  });
});
