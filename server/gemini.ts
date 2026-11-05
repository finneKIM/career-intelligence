import { createHash } from 'node:crypto';
import { json, safeEqual, type ApiRequest, type ApiResponse, type Env, type FetchLike } from './http.js';

/** Gemini 공통 유틸: 키 결정, 모델 목록 조회, 모델 순위/캐시, 업스트림 오류 해석 */

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_RE = /^[A-Za-z0-9_-]{20,120}$/;
/** 사용자가 직접 지정하는 모델명 검증 (경로 조작 방지) */
export const MODEL_RE = /^[a-z0-9][a-z0-9._-]{2,80}$/i;

// ---------------------------------------------------------------
// 키 결정: ① 방문자 본인 키(x-gemini-key) ② 운영자 키 — 접근 코드가 설정·일치할 때만
// ---------------------------------------------------------------

export type KeyResult = { apiKey: string } | { denied: ApiResponse };

export function resolveGeminiKey(req: ApiRequest, env: Env): KeyResult {
  const userKey = (req.headers['x-gemini-key'] ?? '').trim();
  if (userKey) {
    if (!KEY_RE.test(userKey)) return { denied: json(400, { error: 'Gemini API 키 형식이 올바르지 않습니다.' }) };
    return { apiKey: userKey };
  }
  const needKey = json(503, { error: 'Gemini API 키가 필요합니다. 설정 탭에서 본인의 키를 입력해 주세요.' });
  if (!env.GEMINI_API_KEY) return { denied: needKey };
  const expected = env.APP_ACCESS_CODE;
  // 접근 코드가 설정되지 않은 서버에서는 운영자 키를 쓰지 않는다(fail-closed): 누구나 내 무료 한도를 쓰는 것을 방지.
  if (!expected) return { denied: needKey };
  if (!safeEqual(req.headers['x-access-code'] ?? '', expected)) {
    return { denied: json(401, { error: '접근 코드가 올바르지 않습니다. 코드를 모르면 본인의 Gemini 키를 입력해 주세요.' }) };
  }
  return { apiKey: env.GEMINI_API_KEY };
}

// ---------------------------------------------------------------
// 모델 목록 / 순위
// ---------------------------------------------------------------

export interface GeminiModelInfo {
  name: string; // 'models/gemini-3.8-flash'
  supportedGenerationMethods?: string[];
}

/** 키에 허용된 모델 목록 조회 (최대 3페이지). 실패하면 null */
export async function listModels(fetch: FetchLike, apiKey: string): Promise<GeminiModelInfo[] | null> {
  const all: GeminiModelInfo[] = [];
  let pageToken = '';
  for (let page = 0; page < 3; page++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const url = `${GEMINI_BASE}/models?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const res = await fetch(url, { method: 'GET', headers: { 'x-goog-api-key': apiKey }, signal: controller.signal });
      if (!res.ok) return page === 0 ? null : all;
      const data = (await res.json()) as { models?: GeminiModelInfo[]; nextPageToken?: string };
      if (Array.isArray(data.models)) all.push(...data.models.filter((m) => typeof m?.name === 'string'));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    } catch {
      return page === 0 ? null : all;
    } finally {
      clearTimeout(timer);
    }
  }
  return all;
}

// 텍스트 생성에 부적합한 모델군
const EXCLUDE = /(tts|image|transcribe|embed|aqa|robotics|computer-use|antigravity|deep-research|lyria|omni|nano-banana|customtools|gemma|imagen|veo|live|audio|native)/i;

/**
 * 텍스트 생성(generateContent)에 쓸 모델을 좋은 순서로 정렬해 id 배열로 반환.
 * 순위: Flash(안정) > Flash-Lite > Pro, 같은 군에서는 안정판 우선, 버전이 높은 순, `-latest` 별칭은 마지막.
 */
export function rankTextModels(models: GeminiModelInfo[]): string[] {
  const scored: { id: string; key: [number, number, number] }[] = [];
  for (const m of models) {
    const id = m.name.replace(/^models\//, '');
    if (!/^gemini-/i.test(id) || EXCLUDE.test(id)) continue;
    const methods = m.supportedGenerationMethods;
    if (Array.isArray(methods) && !methods.includes('generateContent')) continue;

    const lite = /flash-lite/i.test(id);
    const flash = /flash/i.test(id) && !lite;
    const pro = /pro/i.test(id);
    if (!flash && !lite && !pro) continue;
    const family = flash ? 0 : lite ? 1 : 2;
    const preview = /preview|exp/i.test(id) ? 1 : 0;
    const alias = /-latest$/i.test(id);
    const version = alias ? -1 : parseFloat(id.match(/^gemini-(\d+(?:\.\d+)?)/i)?.[1] ?? '0');
    scored.push({ id, key: [family * 2 + preview, 0, -version] });
  }
  scored.sort((a, b) => a.key[0] - b.key[0] || a.key[2] - b.key[2] || a.id.localeCompare(b.id));
  return [...new Set(scored.map((s) => s.id))];
}

/** 목록 조회에 실패했을 때 쓰는 후보 (Google이 유지하는 별칭 우선) */
export const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; ranked: string[] }>();

/** 키를 저장하지 않고 해시로만 캐시 키를 만든다 */
const keyHash = (apiKey: string) => createHash('sha256').update(apiKey).digest('hex');

export async function getRankedModels(fetch: FetchLike, apiKey: string, now: number): Promise<{ ranked: string[]; fromApi: boolean }> {
  const h = keyHash(apiKey);
  const hit = cache.get(h);
  if (hit && now - hit.at < CACHE_TTL_MS) return { ranked: hit.ranked, fromApi: true };

  const models = await listModels(fetch, apiKey);
  const ranked = models ? rankTextModels(models) : [];
  if (ranked.length === 0) return { ranked: FALLBACK_MODELS, fromApi: false };

  if (cache.size > 200) cache.clear();
  cache.set(h, { at: now, ranked });
  return { ranked, fromApi: true };
}

// 최근 실패한 모델을 잠시 후순위로 미룬다 (키 해시 + 모델명 기준, 인스턴스 메모리)
const FAILURE_TTL_MS = 10 * 60 * 1000;
const failures = new Map<string, number>(); // `${keyHash}|${model}` → 만료 시각

/** 이 키로 해당 모델 호출이 실패(403/404/5xx/시간 초과)했음을 기록 */
export function recordModelFailure(apiKey: string, model: string, now: number): void {
  if (failures.size > 500) failures.clear();
  failures.set(`${keyHash(apiKey)}|${model}`, now + FAILURE_TTL_MS);
}

/** 최근 실패한 모델은 목록 뒤로 보낸다(제거하지는 않음 — 모두 실패했던 경우에도 다시 시도할 수 있게). 상대 순서는 유지. */
export function orderByHealth(apiKey: string, ranked: string[], now: number): string[] {
  const h = keyHash(apiKey);
  const healthy: string[] = [];
  const recentlyFailed: string[] = [];
  for (const m of ranked) {
    const until = failures.get(`${h}|${m}`);
    (until !== undefined && until > now ? recentlyFailed : healthy).push(m);
  }
  return [...healthy, ...recentlyFailed];
}

/** 테스트용 */
export const _clearModelCache = () => {
  cache.clear();
  failures.clear();
};

// ---------------------------------------------------------------
// 업스트림 오류 해석 (키가 섞이지 않도록 정리)
// ---------------------------------------------------------------

export async function upstreamReason(res: { json(): Promise<unknown> }, apiKey: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { status?: string; message?: string } };
    const status = body?.error?.status ?? '';
    const msg = (body?.error?.message ?? '').split(apiKey).join('***').slice(0, 160);
    return [status, msg].filter(Boolean).join(': ');
  } catch {
    return '';
  }
}
