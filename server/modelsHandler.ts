import { guardRequest, json, RateLimiter, type ApiRequest, type ApiResponse, type HandlerDeps } from './http.js';
import { getRankedModels, resolveGeminiKey } from './gemini.js';

const limiter = new RateLimiter(20, 60_000);

/**
 * 이 키로 쓸 수 있는 텍스트 생성 모델 목록(추천 순) 반환.
 * 모델 목록 조회는 사용자 데이터를 전송하지 않으며 호출 한도도 소모하지 않는다.
 * 키 결정 규칙은 /api/llm 과 동일(방문자 키 우선, 운영자 키는 접근 코드 필요).
 */
export async function handleModels(req: ApiRequest, deps: HandlerDeps): Promise<ApiResponse> {
  const denied = guardRequest(req, deps.env, { requireAccessCode: false });
  if (denied) return denied;

  const keyResult = resolveGeminiKey(req, deps.env);
  if ('denied' in keyResult) return keyResult.denied;

  const now = (deps.now ?? Date.now)();
  if (!limiter.check(req.ip ?? 'unknown', now)) {
    return json(429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': '60' });
  }

  const { ranked, fromApi } = await getRankedModels(deps.fetch, keyResult.apiKey, now);
  return json(200, { models: ranked.slice(0, 30), recommended: ranked[0] ?? null, fromApi });
}
