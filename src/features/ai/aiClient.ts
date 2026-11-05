import type { JobDescription, Profile, Project } from '../../types';

/**
 * 서버리스(/api/*) 호출 클라이언트.
 * - 방문자가 입력한 Gemini 키·노션 토큰은 기본적으로 sessionStorage(탭을 닫으면 삭제)에만 보관하고,
 *   사용자가 명시적으로 "계속 기억하기"를 켠 경우에만 localStorage에 둔다. 이 파일에 비밀 값은 없다.
 * - 개인정보 동의(consent)를 받기 전에는 LLM 호출을 막는다.
 */

const CONSENT_KEY = 'ci.ai.consent.v1';
const ACCESS_CODE_KEY = 'ci.ai.accessCode';
const NOTION_KEY = 'ci.notion.credentials';
const GEMINI_KEY = 'ci.ai.geminiKey';
const MODEL_KEY = 'ci.ai.model';

/** 세션(탭 한정) → 영구 순으로 조회. 기본 저장 위치는 세션. */
function readSecret(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}
function writeSecret(key: string, value: string | null, persist: boolean): void {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  if (value) (persist ? localStorage : sessionStorage).setItem(key, value);
}
/** 값이 영구 저장(localStorage)되어 있는지 */
export const isPersisted = (key: 'notion' | 'gemini'): boolean =>
  localStorage.getItem(key === 'notion' ? NOTION_KEY : GEMINI_KEY) !== null;

/** 사용자가 고른 모델명 (비밀 값이 아님). 빈 값 = 자동 선택 */
export const getGeminiModel = (): string => localStorage.getItem(MODEL_KEY) ?? '';
export const setGeminiModel = (v: string): void =>
  v ? localStorage.setItem(MODEL_KEY, v) : localStorage.removeItem(MODEL_KEY);

export const getGeminiKey = (): string => readSecret(GEMINI_KEY) ?? '';
export const setGeminiKey = (v: string, persist = false): void => writeSecret(GEMINI_KEY, v.trim() || null, persist);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------
// 로컬 설정 (브라우저 localStorage)
// ---------------------------------------------------------------

export const hasAiConsent = (): boolean => localStorage.getItem(CONSENT_KEY) === 'yes';
export const setAiConsent = (v: boolean): void =>
  v ? localStorage.setItem(CONSENT_KEY, 'yes') : localStorage.removeItem(CONSENT_KEY);

export const getAccessCode = (): string => localStorage.getItem(ACCESS_CODE_KEY) ?? '';
export const setAccessCode = (v: string): void =>
  v ? localStorage.setItem(ACCESS_CODE_KEY, v) : localStorage.removeItem(ACCESS_CODE_KEY);

export interface NotionCredentials {
  token: string;
  databaseId: string;
}
export const loadNotionCredentials = (): NotionCredentials | null => {
  try {
    const raw = readSecret(NOTION_KEY);
    return raw ? (JSON.parse(raw) as NotionCredentials) : null;
  } catch {
    return null;
  }
};
export const saveNotionCredentials = (c: NotionCredentials | null, persist = false): void =>
  writeSecret(NOTION_KEY, c ? JSON.stringify(c) : null, persist);

// ---------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------

async function post<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.', 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    throw new ApiError(msg ?? `요청 실패 (상태 ${res.status})`, res.status);
  }
  return data as T;
}

export interface Health {
  /** 서버에 운영자 Gemini 키가 있음 (접근 코드가 맞아야 사용 가능) */
  llm: boolean;
  accessCodeRequired: boolean;
  /** 방문자가 본인 Gemini 키를 입력해 쓰는 방식 지원 */
  byok?: boolean;
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    const data = (await res.json()) as Health;
    return typeof data.llm === 'boolean' ? data : null;
  } catch {
    return null;
  }
}

export type LlmTask = 'parse-jd' | 'match-insight' | 'polish';

/** Gemini 호출용 인증 헤더: 본인 키가 있으면 키, 없을 때만 운영자 키용 접근 코드 */
function geminiAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = getGeminiKey();
  const code = getAccessCode();
  if (key) headers['x-gemini-key'] = key;
  else if (code) headers['x-access-code'] = code;
  return headers;
}

export interface LlmOutcome<T> {
  result: T;
  /** 실제로 사용된 모델 */
  model: string;
  /** 이번 요청에서 먼저 실패해 건너뛴 모델 내역 (예: 'gemini-3.8-flash(503)') */
  attempts: string[];
}

export async function callLlmDetailed<T>(task: LlmTask, payload: unknown): Promise<LlmOutcome<T>> {
  if (!hasAiConsent()) {
    throw new ApiError('AI 기능을 쓰려면 설정 탭에서 데이터 전송 동의가 필요합니다.', 0);
  }
  const headers = geminiAuthHeaders();
  const model = getGeminiModel();
  if (model) headers['x-gemini-model'] = model;
  const out = await post<{ result: T; model?: string; attempts?: string[] }>('/api/llm', { task, payload }, headers);
  return { result: out.result, model: out.model ?? '', attempts: out.attempts ?? [] };
}

export async function callLlm<T>(task: LlmTask, payload: unknown): Promise<T> {
  return (await callLlmDetailed<T>(task, payload)).result;
}

export interface ModelList {
  models: string[];
  recommended: string | null;
  /** false면 Google 목록 조회에 실패해 기본 후보를 보여 주는 것 */
  fromApi: boolean;
}

/** 이 키로 쓸 수 있는 텍스트 모델 목록 (추천 순). 사용자 데이터는 전송하지 않는다. */
export const fetchModels = () => post<ModelList>('/api/models', {}, geminiAuthHeaders());

export const fetchNotionDatabase = (creds: NotionCredentials) => post<unknown>('/api/notion', creds);

// ---------------------------------------------------------------
// 결과 타입 + 전송 페이로드 (개인 식별 정보는 보내지 않는다: 이름·연락처 제외)
// ---------------------------------------------------------------

export interface ParsedJdResult {
  company: string;
  role: string;
  domain: string;
  responsibilities: string[];
  qualifications: string[];
  preferred: string[];
}

export interface MatchInsightResult {
  summary: string;
  items: { requirement: string; assessment: 'strong' | 'partial' | 'weak'; reason: string; improvement: string }[];
}

export interface PolishResult {
  suggestions: { text: string; note: string }[];
}

export function buildMatchInsightPayload(jd: JobDescription, projects: Project[], profile: Profile | null) {
  return {
    requirements: [...jd.sections.qualifications, ...jd.sections.responsibilities, ...jd.sections.preferred].slice(0, 30),
    projects: projects.map((p) => ({ title: p.title, techStack: p.techStack, outcomes: p.outcomes })),
    skills: profile?.skills ?? [],
  };
}
