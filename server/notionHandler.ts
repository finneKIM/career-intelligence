import { guardRequest, json, RateLimiter, type ApiRequest, type ApiResponse, type HandlerDeps } from './http.js';

const NOTION_BASE = 'https://api.notion.com/v1';
const DEFAULT_NOTION_VERSION = '2022-06-28';
const limiter = new RateLimiter(20, 60_000);

/** 노션 DB ID: 32자리 hex (하이픈 유무 허용) 또는 URL 속 ID를 정규화. 올바르지 않으면 null */
export function normalizeDatabaseId(input: string): string | null {
  const m = input.trim().match(/([0-9a-f]{32})(?:[?#].*)?$/i) ?? input.trim().replace(/-/g, '').match(/^([0-9a-f]{32})$/i);
  return m ? m[1].toLowerCase() : null;
}

const TOKEN_RE = /^(secret_|ntn_)[A-Za-z0-9_]{20,200}$/;

/**
 * 노션 프록시: 방문자가 보낸 본인의 통합 토큰으로 노션 API를 대신 호출만 한다.
 *  - 토큰은 저장·기록하지 않고 응답/오류 메시지에도 싣지 않는다.
 *  - 서버에는 운영자의 노션 토큰이 없다(방문자마다 계정·DB가 다르므로).
 *  - 호스트(api.notion.com)와 경로는 서버에서 고정하므로 임의 URL 호출(SSRF)이 불가능하다.
 *  - 접근 코드는 요구하지 않는다(공개 서비스). 남용은 출처 검사·크기 제한·IP별 호출 제한으로 완화한다.
 */
export async function handleNotion(req: ApiRequest, deps: HandlerDeps): Promise<ApiResponse> {
  const denied = guardRequest(req, deps.env, { requireAccessCode: false });
  if (denied) return denied;

  const now = (deps.now ?? Date.now)();
  if (!limiter.check(req.ip ?? 'unknown', now)) {
    return json(429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': '60' });
  }

  const body = req.body as { token?: unknown; databaseId?: unknown } | undefined;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const dbId = typeof body?.databaseId === 'string' ? normalizeDatabaseId(body.databaseId) : null;
  if (!TOKEN_RE.test(token)) return json(400, { error: '노션 통합 토큰 형식이 올바르지 않습니다. (secret_… 또는 ntn_…)' });
  if (!dbId) return json(400, { error: '노션 데이터베이스 ID 형식이 올바르지 않습니다.' });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': deps.env.NOTION_VERSION || DEFAULT_NOTION_VERSION,
    'Content-Type': 'application/json',
  };

  const call = async (path: string, method: string, payload?: unknown) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      return await deps.fetch(`${NOTION_BASE}${path}`, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const dbRes = await call(`/databases/${dbId}`, 'GET');
    if (dbRes.status === 401) return json(401, { error: '노션 토큰이 올바르지 않거나 만료되었습니다.' });
    if (dbRes.status === 404) {
      return json(404, { error: '데이터베이스를 찾을 수 없습니다. 노션에서 해당 DB에 통합(Integration)을 연결했는지 확인하세요.' });
    }
    if (!dbRes.ok) return json(502, { error: `노션 호출 실패 (상태 ${dbRes.status})` });
    const database = await dbRes.json();

    // 최대 3페이지(300행)까지 수집
    const results: unknown[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const qRes = await call(`/databases/${dbId}/query`, 'POST', { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      if (!qRes.ok) return json(502, { error: `노션 조회 실패 (상태 ${qRes.status})` });
      const q = (await qRes.json()) as { results?: unknown[]; has_more?: boolean; next_cursor?: string | null };
      results.push(...(q.results ?? []));
      if (!q.has_more || !q.next_cursor) break;
      cursor = q.next_cursor;
    }

    // 클라이언트의 parseSource가 그대로 읽을 수 있는 { database, query } 형태로 반환
    return json(200, { database, query: { object: 'list', results } });
  } catch {
    return json(504, { error: '노션 응답 시간이 초과되었거나 연결에 실패했습니다.' });
  }
}
