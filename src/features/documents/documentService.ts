/**
 * 맞춤 문서 생성 서비스 (순수 함수 + 저장). AI는 "근거로 제시된 자료"만 재구성하게 하고,
 * 모든 문단에 근거 ID를 연결한다. 사용자가 검수·확정하기 전에는 확정본으로 취급하지 않는다.
 */
import type { CareerIntelDB } from '../../db';
import type {
  CompanyMaterial, CompanySummary, DocKind, EvidenceRef, GeneratedDocument, JobDescription, Profile, Project, SourceDocument,
} from '../../types';
import { placeholderize, rulesFromProfile, composePlaceholders, type Contact } from '../../utils/piiRedaction';
import type { GeneratedResult, LlmTask } from '../ai/aiClient';
import type { KeywordMatch } from '../analysis/keywords';

export const ANALYSIS_VERSION = 'doc-gen-v1';
export const KIND_LABEL: Record<DocKind, string> = { RESUME: '이력서', COVER_LETTER: '자기소개서', PORTFOLIO: '포트폴리오' };
export const KIND_TASK: Record<DocKind, LlmTask> = {
  RESUME: 'generate-resume',
  COVER_LETTER: 'generate-cover-letter',
  PORTFOLIO: 'generate-portfolio',
};

export interface EvidenceItem {
  id: string; // 'e1'…
  type: EvidenceRef['type'];
  refId: string;
  label: string;
  text: string;
}

const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9+#.]{2,}|[가-힣]{2,}/g) ?? []));

/** 공고 요구사항과 겹치는 단어가 많은 프로젝트를 먼저 고른다(근거는 최대 limit 개) */
export function buildEvidence(jd: JobDescription, projects: Project[], profile: Profile | null, limit = 45, preferProjectIds: string[] = []): EvidenceItem[] {
  const prefer = new Set(preferProjectIds);
  const want = tokens([...jd.sections.qualifications, ...jd.sections.responsibilities, ...jd.sections.preferred, jd.role, jd.domain].join(' '));
  const scored = projects
    .map((p) => {
      const t = tokens([p.title, p.role, p.description, p.techStack.join(' '), p.outcomes.join(' ')].join(' '));
      let score = 0;
      for (const w of t) if (want.has(w)) score++;
      return { p, score: score + (prefer.has(p.id) ? 1000 : 0) };
    })
    .sort((a, b) => b.score - a.score || b.p.updatedAt.localeCompare(a.p.updatedAt));
  const out: EvidenceItem[] = [];
  let n = 0;
  const add = (type: EvidenceRef['type'], refId: string, label: string, text: string) => {
    if (out.length < limit && text.trim()) out.push({ id: `e${++n}`, type, refId, label, text: text.trim() });
  };
  if (profile?.skills.length) add('skill', 'skills', '보유 기술', profile.skills.join(', '));
  for (const { p } of scored) {
    add('project', p.id, p.title, `${p.role}. ${p.description} (기술: ${p.techStack.join(', ')})`);
    p.outcomes.forEach((o, i) => add('outcome', `${p.id}#${i}`, `${p.title} 성과`, o));
  }
  return out;
}

/** 어필 포인트의 근거(프로젝트·성과·기술)가 근거 목록에서 몇 번 ID인지 찾는다 */
export function appealEvidenceIds(a: KeywordMatch, evidence: EvidenceItem[]): string[] {
  const ids = new Set<string>();
  for (const ref of a.evidence) {
    for (const e of evidence) if (e.type === ref.type && e.refId === ref.refId) ids.add(e.id);
    // 성과 근거가 선택되면 같은 프로젝트의 프로젝트 개요도 함께 쓸 수 있게 한다
    if (ref.type === 'outcome') {
      const pid = ref.refId.split('#')[0];
      for (const e of evidence) if (e.type === 'project' && e.refId === pid) ids.add(e.id);
    }
  }
  return [...ids];
}

export function buildGeneratePayload(
  jd: JobDescription,
  evidence: EvidenceItem[],
  company: CompanySummary | null,
  past: SourceDocument[],
  appeals: KeywordMatch[] = [],
) {
  return {
    ...(appeals.length > 0
      ? { appealPoints: appeals.slice(0, 8).map((a) => ({ term: a.term, level: a.level, evidenceIds: appealEvidenceIds(a, evidence) })) }
      : {}),
    job: {
      company: jd.company,
      role: jd.role,
      requirements: [...jd.sections.qualifications, ...jd.sections.responsibilities, ...jd.sections.preferred].slice(0, 30),
    },
    evidence: evidence.map((e) => ({ id: e.id, type: e.type, label: e.label, text: e.text })),
    ...(company ? { companySummary: { overview: company.overview, keyPoints: company.keyPoints } } : {}),
    pastDocs: past.slice(0, 4).map((d) => ({ id: d.id, title: d.title, excerpt: d.body.slice(0, 800) })),
  };
}

/** 저장용 문서로 변환. 이름·연락처는 자리표시자로 치환해 보관(내보낼 때만 합성) */
export function toGeneratedDocument(
  kind: DocKind,
  jd: JobDescription,
  result: GeneratedResult,
  evidence: EvidenceItem[],
  profile: Profile | null,
  meta: { model: string; previousVersionId?: string; now?: string; appealPoints?: GeneratedDocument['appealPoints'] },
): GeneratedDocument {
  const rules = rulesFromProfile(profile);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const now = meta.now ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    kind,
    jdId: jd.id,
    title: `${jd.company} ${jd.role} ${KIND_LABEL[kind]}`,
    sections: result.sections.map((s) => ({
      heading: placeholderize(s.heading, rules),
      paragraphs: s.paragraphs.map((p) => ({
        text: placeholderize(p.text, rules),
        evidence: p.evidenceIds.flatMap((id) => {
          const e = byId.get(id);
          return e ? [{ type: e.type, refId: e.refId, label: e.label } satisfies EvidenceRef] : [];
        }),
      })),
    })),
    generatedAt: now,
    model: meta.model,
    analysisVersion: ANALYSIS_VERSION,
    status: 'DRAFT',
    previousVersionId: meta.previousVersionId,
    ...(meta.appealPoints?.length ? { appealPoints: meta.appealPoints } : {}),
    updatedAt: now,
  };
}

/** 수정·확정은 덮어쓰지 않고 새 버전을 만든다 */
export function nextVersion(doc: GeneratedDocument, patch: Partial<Pick<GeneratedDocument, 'sections' | 'status'>>, now = new Date().toISOString()): GeneratedDocument {
  return { ...doc, ...patch, id: crypto.randomUUID(), previousVersionId: doc.id, generatedAt: doc.generatedAt, updatedAt: now };
}

export async function saveSourceDocument(db: CareerIntelDB, input: { kind: DocKind; title: string; body: string }, profile: Profile | null): Promise<SourceDocument> {
  const rules = rulesFromProfile(profile);
  const now = new Date().toISOString();
  const doc: SourceDocument = {
    id: crypto.randomUUID(),
    kind: input.kind,
    title: input.title.trim() || KIND_LABEL[input.kind],
    // 원문 그대로가 아니라 이름·연락처를 자리표시자로 바꿔 저장한다
    body: placeholderize(input.body, rules),
    createdAt: now,
    updatedAt: now,
  };
  await db.sourceDocuments.put(doc);
  return doc;
}

export function latestSummary(materials: CompanyMaterial[]): CompanySummary | null {
  const all = materials.flatMap((m) => (m.summary ? [m.summary] : []));
  return all.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null;
}

export function contactOf(profile: Profile | null): Contact {
  return { name: profile?.name && !profile.name.includes('기본 프로필') ? profile.name : '', email: profile?.email, phone: profile?.phone, address: profile?.address };
}

/** 화면·내보내기용: 자리표시자를 실제 연락처로 합성(브라우저 안에서만) */
export const compose = (text: string, profile: Profile | null) => composePlaceholders(text, contactOf(profile));

export function documentAsText(doc: GeneratedDocument, profile: Profile | null): string {
  const head = [compose('{{이름}}', profile), compose('{{이메일}}', profile), compose('{{전화}}', profile)].filter((x) => !x.startsWith('{{')).join(' · ');
  const body = doc.sections.map((s) => `${compose(s.heading, profile)}\n${s.paragraphs.map((p) => `- ${compose(p.text, profile)}`).join('\n')}`).join('\n\n');
  return [doc.title, head, '', body].filter((x, i) => x !== '' || i === 2).join('\n');
}
