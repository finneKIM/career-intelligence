import {
  guardRequest,
  json,
  RateLimiter,
  type ApiRequest,
  type ApiResponse,
  type HandlerDeps,
} from './http.js';
import { buildPrompt, validateMatchInsight, validateParseJd, validatePolish, type LlmTask } from './prompts.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TASKS: LlmTask[] = ['parse-jd', 'match-insight', 'polish'];

// 무료 한도 보호용 (인스턴스별 best-effort): IP당 분당 10회
const limiter = new RateLimiter(10, 60_000);

/** 모델이 ```json 코드블록으로 감싸 응답하는 경우까지 허용하는 JSON 추출 */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export async function handleLlm(req: ApiRequest, deps: HandlerDeps): Promise<ApiResponse> {
  const { env } = deps;
  const denied = guardRequest(req, env, { requireAccessCode: true });
  if (denied) return denied;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { error: 'LLM이 설정되지 않았습니다. (서버 환경 변수 GEMINI_API_KEY 필요)' });

  const now = (deps.now ?? Date.now)();
  if (!limiter.check(req.ip ?? 'unknown', now)) {
    return json(429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': '60' });
  }

  const body = req.body as { task?: string; payload?: unknown } | undefined;
  if (!body || !TASKS.includes(body.task as LlmTask)) return json(400, { error: '지원하지 않는 task입니다.' });
  const task = body.task as LlmTask;

  const prompt = buildPrompt(task, body.payload);
  if ('error' in prompt) return json(400, { error: prompt.error });

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let upstream;
  try {
    upstream = await deps.fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
  } catch {
    return json(504, { error: 'LLM 응답 시간이 초과되었거나 연결에 실패했습니다.' });
  } finally {
    clearTimeout(timer);
  }

  if (upstream.status === 429) return json(429, { error: 'LLM 무료 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.' });
  if (upstream.status === 404) {
    return json(502, { error: `LLM 모델(${model})을 찾을 수 없습니다. 서버 환경 변수 GEMINI_MODEL에 현재 사용 가능한 모델명을 지정해 주세요.` });
  }
  if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) {
    return json(502, { error: 'LLM 키가 올바르지 않거나 이 모델에 대한 권한이 없습니다. 서버 환경 변수를 확인해 주세요.' });
  }
  if (!upstream.ok) return json(502, { error: `LLM 호출 실패 (상태 ${upstream.status})` });

  const data = (await upstream.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const parsed = extractJson(text);

  const payload = body.payload as Record<string, unknown>;
  let result: unknown = null;
  if (task === 'parse-jd') result = validateParseJd(parsed);
  else if (task === 'match-insight') result = validateMatchInsight(parsed, (payload.requirements as string[]) ?? []);
  else result = validatePolish(parsed, String(payload.text ?? ''));

  if (!result) return json(502, { error: 'LLM 응답을 해석하지 못했습니다. 다시 시도해 주세요.' });
  return json(200, { task, result });
}
