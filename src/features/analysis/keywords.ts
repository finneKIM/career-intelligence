/**
 * 핵심 키워드 추출·대조 (6-C). 규칙 기반이라 같은 입력이면 항상 같은 결과가 나온다(결정적).
 * 대조는 AGENTS.md 8절 원칙을 따른다: 단어가 "나온다"는 이유로 경험이 있다고 단정하지 않고
 *  - 직접(DIRECT): 보유 기술·프로젝트 기술 스택·성과 문장에 있음
 *  - 간접(INDIRECT): 프로젝트 설명·제목·역할이나 과거 제출 자료에서만 언급됨
 *  - 확인되지 않음(UNCONFIRMED): 어디에서도 찾지 못함
 * 으로 나눈다.
 */
import type { EvidenceRef, JobDescription, Profile, Project, SourceDocument } from '../../types';

export type KeywordLevel = 'DIRECT' | 'INDIRECT' | 'UNCONFIRMED';

export interface Keyword {
  term: string;
  weight: number;
  origins: ('JD' | 'COMPANY' | 'AI')[];
}

export interface KeywordMatch extends Keyword {
  level: KeywordLevel;
  evidence: EvidenceRef[];
}

const TECH_TERMS = [
  'python', 'java', 'kotlin', 'swift', 'typescript', 'javascript', 'go', 'rust', 'c++', 'c#', 'sql', 'nosql', 'react', 'vue', 'angular', 'next.js', 'node.js', 'spring',
  'fastapi', 'django', 'flask', 'pytorch', 'tensorflow', 'keras', 'scikit-learn', 'pandas', 'numpy', 'spark', 'hadoop', 'kafka', 'airflow', 'docker', 'kubernetes', 'k8s',
  'aws', 'gcp', 'azure', 'terraform', 'linux', 'git', 'ci/cd', 'mlops', 'llm', 'rag', 'nlp', 'cv', 'stt', 'tts', 'asr', 'gpu', 'cuda', 'onnx', 'tensorrt', 'redis',
  'postgresql', 'mysql', 'mongodb', 'elasticsearch', 'graphql', 'grpc', 'rest', 'api', 'ffmpeg', 'webrtc', 'transformer', 'diffusion', 'agile', 'figma',
];
const TECH_SET = new Set(TECH_TERMS);

const STOP_EN = new Set([
  'the', 'and', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'has', 'from', 'that', 'this', 'your', 'who', 'job', 'work', 'team', 'years', 'year', 'plus', 'more',
  'experience', 'ability', 'strong', 'good', 'etc', 'new', 'all', 'such', 'using', 'use', 'role', 'must', 'able', 'including', 'preferred', 'required',
]);
const STOP_KO = new Set([
  '경험', '우대', '가능', '업무', '담당', '이상', '관련', '능력', '필요', '사용', '개발', '진행', '통해', '대한', '위한', '있는', '하는', '또는', '그리고', '및', '등', '해당',
  '지원', '채용', '모집', '자격', '요건', '사항', '기반', '경우', '이해', '활용', '수행', '다양한', '함께', '모든', '있으신', '하신', '분', '자', '년', '명', '회사', '팀',
]);

/** 한국어 조사 흉내: 어절 끝의 흔한 조사 한 글자를 떼어 같은 단어가 합쳐지게 한다(과하게 자르지 않도록 3글자 이상일 때만) */
const stripJosa = (w: string) => (w.length >= 3 && /[을를이가은는의에로와과도]$/.test(w) ? w.slice(0, -1) : w);

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+#.\/-]*[A-Za-z0-9+#]|[A-Za-z]{2}|[가-힣]{2,}/g)) {
    const raw = m[0];
    if (/^[가-힣]/.test(raw)) {
      const w = stripJosa(raw);
      if (!STOP_KO.has(w) && w.length >= 2) out.push(w);
    } else {
      const w = raw.toLowerCase().replace(/[./-]+$/, '');
      if (w.length >= 2 && !STOP_EN.has(w) && !/^\d+$/.test(w)) out.push(w);
    }
  }
  return out;
}

export interface KeywordSource {
  jd: JobDescription;
  companyText?: string;
}

/** 공고(자격요건 ×3, 주요업무 ×2, 우대 ×1.5, 직무·분야 ×2)와 기업 자료(×1)에서 점수가 높은 단어를 뽑는다 */
export function extractKeywords(src: KeywordSource, limit = 20): Keyword[] {
  const acc = new Map<string, { weight: number; origins: Set<'JD' | 'COMPANY'>; display: string }>();
  const add = (text: string, w: number, origin: 'JD' | 'COMPANY') => {
    for (const t of tokens(text)) {
      const e = acc.get(t) ?? { weight: 0, origins: new Set(), display: t };
      e.weight += w * (TECH_SET.has(t) ? 2 : 1);
      e.origins.add(origin);
      acc.set(t, e);
    }
  };
  const { jd } = src;
  jd.sections.qualifications.forEach((x) => add(x, 3, 'JD'));
  jd.sections.responsibilities.forEach((x) => add(x, 2, 'JD'));
  jd.sections.preferred.forEach((x) => add(x, 1.5, 'JD'));
  add(`${jd.role} ${jd.domain}`, 2, 'JD');
  if (src.companyText) add(src.companyText, 1, 'COMPANY');
  return [...acc.entries()]
    .filter(([, e]) => e.weight >= 2)
    .sort((a, b) => b[1].weight - a[1].weight || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, e]) => ({ term, weight: Math.round(e.weight * 10) / 10, origins: [...e.origins] }));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** 영문·기호 단어는 단어 경계를 지켜 찾고(java ≠ javascript), 한글은 부분 일치로 찾는다 */
export function containsTerm(text: string, term: string): boolean {
  if (/^[가-힣]/.test(term)) return text.includes(term);
  return new RegExp(`(^|[^A-Za-z0-9+#])${esc(term)}($|[^A-Za-z0-9+#])`, 'i').test(text);
}

export function compareKeywords(keywords: Keyword[], profile: Profile | null, projects: Project[], sources: SourceDocument[]): KeywordMatch[] {
  return keywords.map((k) => {
    const evidence: EvidenceRef[] = [];
    if (profile?.skills.some((s) => containsTerm(s, k.term))) evidence.push({ type: 'skill', refId: 'skills', label: '보유 기술' });
    let direct = evidence.length > 0;
    for (const p of projects) {
      if (p.techStack.some((t) => containsTerm(t, k.term))) {
        direct = true;
        evidence.push({ type: 'project', refId: p.id, label: p.title });
      }
      p.outcomes.forEach((o, i) => {
        if (containsTerm(o, k.term)) {
          direct = true;
          evidence.push({ type: 'outcome', refId: `${p.id}#${i}`, label: `${p.title} 성과` });
        }
      });
    }
    if (direct) return { ...k, level: 'DIRECT' as const, evidence: evidence.slice(0, 6) };
    const indirect: EvidenceRef[] = [];
    for (const p of projects) {
      if (containsTerm(`${p.title} ${p.role} ${p.description}`, k.term)) indirect.push({ type: 'project', refId: p.id, label: p.title });
    }
    for (const d of sources) {
      if (containsTerm(d.body, k.term)) indirect.push({ type: 'source', refId: d.id, label: d.title });
    }
    return indirect.length > 0 ? { ...k, level: 'INDIRECT' as const, evidence: indirect.slice(0, 6) } : { ...k, level: 'UNCONFIRMED' as const, evidence: [] };
  });
}

/** 어필 후보 3~5개: 직접 경험이 있는 키워드를 중요도순으로. 부족하면 간접을 보충(확인되지 않음은 후보로 쓰지 않음) */
export function suggestAppeals(matches: KeywordMatch[], max = 5, min = 3): KeywordMatch[] {
  const direct = matches.filter((m) => m.level === 'DIRECT').sort((a, b) => b.weight - a.weight || b.evidence.length - a.evidence.length);
  const picked = direct.slice(0, max);
  if (picked.length < min) {
    const indirect = matches.filter((m) => m.level === 'INDIRECT').sort((a, b) => b.weight - a.weight);
    picked.push(...indirect.slice(0, min - picked.length));
  }
  return picked;
}

/** AI가 뽑은 키워드를 규칙 결과에 합친다(중복은 가중치를 올림). 원문 등장 여부는 서버가 이미 검증함 */
export function mergeAiKeywords(base: Keyword[], ai: { term: string }[]): Keyword[] {
  const out = base.map((k) => ({ ...k, origins: [...k.origins] }));
  for (const a of ai) {
    const key = a.term.trim().toLowerCase();
    const hit = out.find((k) => k.term.toLowerCase() === key);
    if (hit) {
      hit.weight += 1;
      if (!hit.origins.includes('AI')) hit.origins.push('AI');
    } else out.push({ term: a.term.trim(), weight: 2, origins: ['AI'] });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

export const LEVEL_LABEL: Record<KeywordLevel, string> = { DIRECT: '직접 경험', INDIRECT: '간접 경험', UNCONFIRMED: '확인되지 않음' };

/** 분석 v2 스냅샷용 요약(장점·보완점). 합격 가능성을 말하지 않고 근거 건수만 서술한다 */
export function summarizeMatches(matches: KeywordMatch[]): { strengths: string[]; improvements: string[] } {
  const strengths = matches
    .filter((m) => m.level === 'DIRECT')
    .slice(0, 5)
    .map((m) => `${m.term} — 근거 ${m.evidence.length}건(${m.evidence.slice(0, 2).map((e) => e.label).join(', ')})`);
  const improvements = matches
    .filter((m) => m.level !== 'DIRECT')
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
    .map((m) =>
      m.level === 'INDIRECT'
        ? `${m.term} — 설명·과거 자료에서만 언급됨. 기술 스택이나 성과 문장으로 직접 드러나게 보완`
        : `${m.term} — 공고에서 비중이 높지만 확인된 경험이 없음. 실제 경험이 있다면 프로젝트에 기록하고, 없다면 학습·준비 계획으로 보완`,
    );
  return { strengths, improvements };
}
