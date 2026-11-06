import { handleAccount } from '../../server/account/handler';
import type { Db } from '../../server/db/types';
import type { Transport } from '../../src/features/account/accountClient';

export const TEST_ENV = { BETTER_AUTH_SECRET: 'test-secret-'.padEnd(48, 'x') };

/** 서버 핸들러에 직접 연결하는 전송 계층 + 쿠키 보관(브라우저 흉내). 한 번에 쓸 수 있는 ip 별로 시도 제한이 따로 센다. */
export function makeTransport(db: Db, ip: string, hook?: (path: string) => void): Transport {
  const jar = new Map<string, string>();
  const noNetwork = (async () => {
    throw new Error('no network');
  }) as never;
  return async (path, body) => {
    hook?.(path);
    const text = JSON.stringify(body ?? {});
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await handleAccount(
      {
        method: 'POST', body: JSON.parse(text), bodyBytes: text.length, ip, path: '/api/account' + path,
        headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
      },
      { env: TEST_ENV, fetch: noNetwork, db },
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
}
