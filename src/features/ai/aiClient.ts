import type { JobDescription, Profile, Project } from '../../types';

/**
 * 서버리스(/api/*) 호출 클라이언트.
 * - LLM 키/노션 토큰은 서버 환경 변수 또는 사용자 입력으로만 다루며 이 파일에 비밀 값은 없다.
 * - 개인정보 동의(consent)를 받기 전에는 LLM 호출을 막는다.
 */

const CONSENT_KEY = 'ci.ai.consent.v1';
const ACCESS_CODE_KEY = 'ci.ai.accessCode';
const NOTION_KEY = 'ci.notion.credentials';

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
    const raw = localStorage.getItem(NOTION_KEY);
    return raw ? (JSON.parse(raw) as NotionCredentials) : null;
  } catch {
    return null;
  }
};
export const saveNotionCredentials = (c: NotionCredentials | null): void =>
  c ? localStorage.setItem(NOTION_KEY, JSON.stringify(c)) : localStorage.removeItem(NOTION_KEY);

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
  llm: boolean;
  accessCodeRequired: boolean;
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

export async function callLlm<T>(task: LlmTask, payload: unknown): Promise<T> {
  if (!hasAiConsent()) {
    throw new ApiError('AI 기능을 쓰려면 설정 탭에서 데이터 전송 동의가 필요합니다.', 0);
  }
  const code = getAccessCode();
  const out = await post<{ result: T }>('/api/llm', { task, payload }, code ? { 'x-access-code': code } : {});
  return out.result;
}

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
