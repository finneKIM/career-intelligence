/**
 * 프레임워크 독립 HTTP 코어.
 * Vercel 서버리스(api/*.ts)와 Vite 개발 서버 미들웨어, 단위 테스트가 모두 이 핸들러를 공유한다.
 */

export interface ApiRequest {
  method: string;
  headers: Record<string, string | undefined>;
  /** 이미 파싱된 JSON 본문 (없으면 undefined) */
  body?: unknown;
  /** 원문 본문 길이(바이트 근사) — 크기 제한 검사용 */
  bodyBytes?: number;
  ip?: string;
  /** 요청 경로(쿼리 제외). 하나의 함수가 여러 하위 경로를 처리할 때 사용 */
  path?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  /** 여러 개일 수 있는 Set-Cookie 값 */
  setCookies?: string[];
}

export type Env = Record<string, string | undefined>;

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface HandlerDeps {
  env: Env;
  fetch: FetchLike;
  now?: () => number;
}

export const json = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({
  status,
  body,
  headers,
});

export const MAX_BODY_BYTES = 60_000;
/** 계정·동기화 API는 레코드 1건이 최대 512KB 암호문이라 별도 한도(Vercel 무료 플랜 본문 상한은 4.5MB) */
export const ACCOUNT_BODY_LIMIT = 1_000_000;

/** 길이가 같을 때 전 구간을 비교하는 문자열 비교 (접근 코드 검사용) */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 공통 요청 가드: 메서드, 크기, 출처(Origin), 접근 코드.
 * 통과하면 null, 거부하면 응답을 반환.
 */
export function guardRequest(req: ApiRequest, env: Env, opts: { requireAccessCode: boolean; maxBytes?: number }): ApiResponse | null {
  if (req.method !== 'POST') return json(405, { error: 'POST만 허용됩니다.' }, { Allow: 'POST' });

  if ((req.bodyBytes ?? 0) > (opts.maxBytes ?? MAX_BODY_BYTES)) return json(413, { error: '요청이 너무 큽니다.' });

  // 출처 검사: ALLOWED_ORIGINS(쉼표 구분)가 있으면 그 목록만, 없으면 Origin 호스트 == Host 인 동일 출처만 허용.
  const origin = req.headers['origin'];
  if (origin) {
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    let ok: boolean;
    if (allowed.length > 0) {
      ok = allowed.includes(origin);
    } else {
      try {
        ok = new URL(origin).host === req.headers['host'];
      } catch {
        ok = false;
      }
    }
    if (!ok) return json(403, { error: '허용되지 않은 출처입니다.' });
  }

  if (opts.requireAccessCode) {
    const expected = env.APP_ACCESS_CODE;
    if (expected) {
      const given = req.headers['x-access-code'] ?? '';
      if (!safeEqual(given, expected)) return json(401, { error: '접근 코드가 올바르지 않습니다.' });
    }
  }
  return null;
}

/** 인스턴스 메모리 기반 고정 윈도 레이트 리미터 (서버리스에서는 인스턴스별 best-effort) */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  check(key: string, now: number): boolean {
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 5000) this.sweep(now);
      return true;
    }
    cur.count += 1;
    return cur.count <= this.limit;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
