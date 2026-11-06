import { guardRequest, json, RateLimiter, type ApiRequest, type ApiResponse, type HandlerDeps } from './http.js';
import {
  GEMINI_BASE,
  MODEL_RE,
  getRankedModels,
  orderByHealth,
  recordModelFailure,
  resolveGeminiKey,
  upstreamReason,
} from './gemini.js';
import { countPiiLeaks } from './piiGuard.js';
import {
  GENERATE_TASKS,
  buildPrompt,
  validateCompanySummary,
  validateKeywords,
  validateSearch,
  validateGenerated,
  validateMatchInsight,
  validateParseJd,
  validatePolish,
  type LlmTask,
} from './prompts.js';

const TASKS: LlmTask[] = ['parse-jd', 'match-insight', 'polish', 'company-summary', 'generate-resume', 'generate-cover-letter', 'generate-portfolio', 'company-search', 'extract-keywords'];
/** 자동 선택 시 한 요청에서 시도할 최대 후보 수. 503처럼 빨리 실패하는 경우가 많아 넉넉히 두고, 실제 상한은 아래 시간 예산이 정한다. */
const MAX_AUTO_TRIES = 6;
/** 자동 모드: 전체 시간 예산 / 시도당 제한 / 이어서 시도할 최소 남은 시간 (서버리스 실행 시간 상한 대비) */
const TOTAL_BUDGET_MS = 40_000;
const PER_TRY_MS = 15_000;
const MIN_TRY_MS = 5_000;
/** 사용자가 모델을 직접 고른 경우의 제한 시간 */
const FIXED_MODEL_TIMEOUT_MS = 25_000;

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
  const denied = guardRequest(req, env, { requireAccessCode: false });
  if (denied) return denied;

  const keyResult = resolveGeminiKey(req, env);
  if ('denied' in keyResult) return keyResult.denied;
  const { apiKey } = keyResult;

  const now = (deps.now ?? Date.now)();
  if (!limiter.check(req.ip ?? 'unknown', now)) {
    return json(429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': '60' });
  }

  const body = req.body as { task?: string; payload?: unknown } | undefined;
  if (!body || !TASKS.includes(body.task as LlmTask)) return json(400, { error: '지원하지 않는 task입니다.' });
  const task = body.task as LlmTask;

  // 안전망: 브라우저가 가리지 못한 개인정보 형태가 있으면 외부(Gemini)로 보내지 않는다. 응답·로그에 원문을 싣지 않는다.
  if (countPiiLeaks(body.payload) > 0) {
    return json(400, {
      error: '이메일·전화번호·주민등록번호 형태의 개인정보가 남아 있어 전송을 거부했습니다. 앱을 새로고침한 뒤 다시 시도하거나, 입력에서 해당 부분을 지워 주세요.',
    });
  }

  const search = task === 'company-search';
  // Google 검색 연동은 유료 키 사용자 한정(앱이 요금제를 자동 판별하지 못해 사용자 선언 헤더를 요구). 실제 가능 여부는 Google이 최종 판단한다.
  if (search && (req.headers['x-gemini-tier'] ?? '').toUpperCase() !== 'PAID') {
    return json(403, { error: 'Google 검색 연동은 유료(결제 연결) Gemini 키를 쓴다고 설정에서 선언한 경우에만 사용할 수 있습니다. 무료 키는 기업 자료를 붙여넣어 주세요.' });
  }

  const prompt = buildPrompt(task, body.payload);
  if ('error' in prompt) return json(400, { error: prompt.error });

  // 모델 결정: ① 사용자가 고른 모델(x-gemini-model) ② 운영자 GEMINI_MODEL ③ 자동(키로 조회한 목록의 순위)
  const requested = (req.headers['x-gemini-model'] ?? '').trim();
  if (requested && !MODEL_RE.test(requested)) return json(400, { error: '모델 이름 형식이 올바르지 않습니다.' });
  const fixed = requested || env.GEMINI_MODEL?.trim() || '';
  const auto = !fixed;
  const candidates = fixed
    ? [fixed]
    : orderByHealth(apiKey, (await getRankedModels(deps.fetch, apiKey, now)).ranked, now).slice(0, MAX_AUTO_TRIES);

  const clock = deps.now ?? Date.now;
  const started = clock();
  const attempts: string[] = []; // 예: 'gemini-3.8-flash(시간 초과)', 'gemini-3.7-flash(503)'
  let upstream: Awaited<ReturnType<HandlerDeps['fetch']>> | null = null;
  let usedModel = candidates[0];
  for (let i = 0; i < candidates.length; i++) {
    usedModel = candidates[i];
    // 자동 모드: 전체 시간 예산 안에서 시도마다 제한 시간을 두고, 예산이 거의 남지 않으면 중단한다(서버리스 실행 시간 상한 대비).
    const remaining = TOTAL_BUDGET_MS - (clock() - started);
    if (i > 0 && remaining < MIN_TRY_MS) break;
    const limit = auto ? Math.min(PER_TRY_MS, Math.max(remaining, MIN_TRY_MS)) : FIXED_MODEL_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    let failed = false;
    try {
      upstream = await deps.fetch(`${GEMINI_BASE}/models/${encodeURIComponent(usedModel)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          // 검색 도구와 JSON 응답 형식은 함께 쓸 수 없어, 검색 작업은 일반 텍스트로 받는다
          generationConfig: search ? { temperature: 0.2, maxOutputTokens: 4096 } : { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096 },
          ...(search ? { tools: [{ google_search: {} }] } : {}),
        }),
        signal: controller.signal,
      });
    } catch {
      upstream = null;
      failed = true;
      attempts.push(`${usedModel}(시간 초과/연결 실패)`);
      if (auto) recordModelFailure(apiKey, usedModel, clock());
    } finally {
      clearTimeout(timer);
    }
    if (failed) {
      if (auto && i < candidates.length - 1) continue; // 다음 후보로
      break;
    }
    const res = upstream!;
    // 자동 모드에서만: 이 키로 쓸 수 없거나(403/404) 일시적으로 응답하지 못하는(5xx) 모델이면 다음 후보로 넘어간다.
    const unusable = res.status === 404 || res.status === 403 || res.status >= 500;
    if (unusable) {
      attempts.push(`${usedModel}(${res.status})`);
      if (auto) recordModelFailure(apiKey, usedModel, clock());
    }
    if (auto && unusable && i < candidates.length - 1) continue;
    break;
  }
  const tried = attempts.length > 0 ? ` 시도한 모델: ${attempts.join(', ')}.` : '';
  if (!upstream) {
    return json(504, {
      error: `LLM 응답 시간이 초과되었거나 연결에 실패했습니다.${tried} 잠시 후 다시 시도하거나 설정 탭에서 다른 모델을 골라 보세요.`,
    });
  }

  if (upstream.status === 429) {
    return json(429, { error: 'LLM 무료 사용 한도에 도달했습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 보세요.' });
  }
  if (upstream.status === 404 || upstream.status === 403) {
    const reason = await upstreamReason(upstream, apiKey);
    return json(502, {
      error: `${auto ? '자동 선택한 모델' : `선택한 모델(${usedModel})`}을(를) 이 키로 사용할 수 없습니다.${tried} 설정 탭에서 다른 모델을 고르거나 키 권한을 확인해 주세요.${reason ? ` [${reason}]` : ''}`,
    });
  }
  if (upstream.status >= 500) {
    const reason = await upstreamReason(upstream, apiKey);
    return json(502, {
      error: `Gemini 서버가 일시적으로 응답하지 못했습니다 (상태 ${upstream.status}).${tried} 잠시 후 다시 시도하거나 설정 탭에서 다른 모델을 골라 보세요.${reason ? ` [${reason}]` : ''}`,
    });
  }
  if (upstream.status === 400 || upstream.status === 401) {
    const reason = await upstreamReason(upstream, apiKey);
    return json(502, { error: `Gemini 키가 올바르지 않거나 요청이 거부되었습니다.${reason ? ` [${reason}]` : ''}` });
  }
  if (!upstream.ok) return json(502, { error: `LLM 호출 실패 (상태 ${upstream.status})` });

  const data = (await upstream.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  const parsed = extractJson(text);

  const payload = body.payload as Record<string, unknown>;
  let result: unknown = null;
  if (task === 'parse-jd') result = validateParseJd(parsed);
  else if (task === 'match-insight') result = validateMatchInsight(parsed, (payload.requirements as string[]) ?? []);
  else if (task === 'company-summary') result = validateCompanySummary(parsed);
  else if (task === 'extract-keywords') result = validateKeywords(parsed, `${String(payload.jdText ?? '')}
${String(payload.companyText ?? '')}`);
  else if (search) result = validateSearch(text, data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []);
  else if (GENERATE_TASKS.includes(task)) {
    const ev = (Array.isArray(payload.evidence) ? payload.evidence : []) as { id?: unknown; text?: unknown; label?: unknown }[];
    result = validateGenerated(
      parsed,
      ev.filter((e) => typeof e?.id === 'string').map((e) => ({ id: String(e.id), text: String(e.text ?? ''), label: String(e.label ?? '') })),
    );
  } else result = validatePolish(parsed, String(payload.text ?? ''));

  if (!result) return json(502, { error: 'LLM 응답을 해석하지 못했습니다. 다시 시도하거나 다른 모델을 선택해 보세요.' });
  // attempts: 이번 요청에서 먼저 실패해 건너뛴 모델 내역 (없으면 빈 배열)
  return json(200, { task, result, model: usedModel, attempts });
}
