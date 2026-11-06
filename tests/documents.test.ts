import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { CareerIntelDB } from '../src/db';
import {
  buildEvidence, buildGeneratePayload, compose, latestSummary, nextVersion, saveSourceDocument, toGeneratedDocument,
} from '../src/features/documents/documentService';
import { buildDocx, buildPptx, buildPrintHtml } from '../src/features/documents/exporters';
import { composePlaceholders, placeholderize, rulesFromProfile } from '../src/utils/piiRedaction';
import type { JobDescription, Profile, Project } from '../src/types';

const profile: Profile = {
  id: 'current-user', name: '김시험', title: '엔지니어', targetRole: 'AI', targetDomains: [], skills: ['PyTorch', 'Docker'],
  email: 'kim@test.invalid', phone: '010-5555-6666', address: '서울', redactTerms: [], updatedAt: '2026-11-06T00:00:00.000Z',
};
const project = (id: string, title: string, tech: string[], outcomes: string[]): Project => ({
  id, title, period: { startDate: '2026-01', isOngoing: false }, role: '개발', techStack: tech, description: `${title} 개발`, outcomes,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});
const jd: JobDescription = {
  id: 'jd1', company: 'A사', role: 'ML 엔지니어', domain: '오디오', rawText: '', parsedAt: '2026-11-06T00:00:00.000Z',
  sections: { qualifications: ['PyTorch 경험'], responsibilities: ['음성 모델 서빙'], preferred: ['Docker'] },
};

describe('저장용 자리표시자', () => {
  const rules = rulesFromProfile(profile);
  it('이름·연락처를 {{이름}} 등으로 바꿔 저장하고, 합성하면 되돌아와야 합니다', () => {
    const stored = placeholderize('김시험입니다. 연락처 010-5555-6666, kim@test.invalid, 다른 번호 02-123-4567', rules);
    expect(stored).toBe('{{이름}}입니다. 연락처 {{전화}}, {{이메일}}, 다른 번호 {{전화}}');
    expect(stored).not.toMatch(/김시험|5555|kim@/);
    expect(composePlaceholders('{{이름}} / {{이메일}} / {{전화}}', { name: '김시험', email: 'kim@test.invalid', phone: '010-5555-6666' })).toBe('김시험 / kim@test.invalid / 010-5555-6666');
    expect(composePlaceholders('{{이름}}', {})).toBe('{{이름}}'); // 값이 없으면 자리표시자 유지
  });
  it('가림 단어(학교 등)는 저장 문서에서 치환하지 않아야 합니다', () => {
    const r = rulesFromProfile({ ...profile, redactTerms: ['시험대학교'] });
    expect(placeholderize('시험대학교 졸업', r)).toBe('시험대학교 졸업');
  });
  it('과거 자료는 저장될 때 자리표시자로 치환되어야 합니다', async () => {
    const db = new CareerIntelDB('docs-1');
    await db.open();
    const d = await saveSourceDocument(db, { kind: 'RESUME', title: '옛 이력서', body: '김시험 / 010-5555-6666' }, profile);
    expect((await db.sourceDocuments.get(d.id))?.body).toBe('{{이름}} / {{전화}}');
  });
});

describe('근거 선별·생성 문서 변환', () => {
  const projects = [
    project('p1', '요리 앱', ['React'], ['매출 3배']),
    project('p2', '음성 모델 서빙', ['PyTorch', 'Docker'], ['지연 180ms를 90ms로 단축']),
  ];
  it('공고와 겹치는 프로젝트의 근거를 먼저 담고 고유 ID를 매겨야 합니다', () => {
    const ev = buildEvidence(jd, projects, profile);
    expect(ev[0]).toMatchObject({ id: 'e1', type: 'skill' });
    expect(ev.find((e) => e.type === 'project')!.refId).toBe('p2');
    expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length);
    expect(buildEvidence(jd, projects, profile, 3)).toHaveLength(3);
  });

  it('페이로드에는 이름·연락처가 없어야 합니다(프로필 본문은 보내지 않음)', () => {
    const payload = JSON.stringify(buildGeneratePayload(jd, buildEvidence(jd, projects, profile), null, []));
    expect(payload).not.toMatch(/김시험|kim@|5555/);
  });

  it('결과를 DRAFT 문서로 변환하고 근거를 연결하며, 이름은 자리표시자로 저장해야 합니다', () => {
    const ev = buildEvidence(jd, projects, profile);
    const outcome = ev.find((e) => e.type === 'outcome' && e.text.includes('180ms'))!;
    const doc = toGeneratedDocument('RESUME', jd, { dropped: 0, sections: [{ heading: '경험', paragraphs: [{ text: '김시험: 지연을 90ms로 단축', evidenceIds: [outcome.id, 'unknown'] }] }] }, ev, profile, { model: 'm' });
    expect(doc.status).toBe('DRAFT');
    expect(doc.sections[0].paragraphs[0].text).toBe('{{이름}}: 지연을 90ms로 단축');
    expect(doc.sections[0].paragraphs[0].evidence).toEqual([{ type: 'outcome', refId: 'p2#0', label: '음성 모델 서빙 성과' }]);
    expect(compose(doc.sections[0].paragraphs[0].text, profile)).toContain('김시험');
  });

  it('수정·확정은 새 버전을 만들고 이전 버전 ID를 가리켜야 합니다(덮어쓰기 없음)', () => {
    const ev = buildEvidence(jd, projects, profile);
    const v1 = toGeneratedDocument('COVER_LETTER', jd, { dropped: 0, sections: [{ heading: 'h', paragraphs: [{ text: 't', evidenceIds: ['e1'] }] }] }, ev, profile, { model: 'm' });
    const v2 = nextVersion(v1, { status: 'CONFIRMED' });
    expect(v2.id).not.toBe(v1.id);
    expect(v2.previousVersionId).toBe(v1.id);
    expect(v2.status).toBe('CONFIRMED');
    expect(v1.status).toBe('DRAFT');
  });

  it('가장 최근 기업 요약을 골라야 합니다', () => {
    const s = (t: string, o: string) => ({ overview: o, keyPoints: [], talentTraits: [], generatedAt: t, model: 'm' });
    expect(latestSummary([{ summary: s('2026-01-01', '옛') }, { summary: s('2026-02-01', '새') }, {}] as never)?.overview).toBe('새');
    expect(latestSummary([])).toBeNull();
  });
});

describe('내보내기 (한글 포함 실제 파일 구조 확인)', () => {
  const ev = buildEvidence(jd, [project('p2', '음성 모델 서빙', ['PyTorch'], ['지연 90ms'])], profile);
  const doc = toGeneratedDocument('RESUME', jd, { dropped: 0, sections: [{ heading: '핵심 역량', paragraphs: [{ text: '지연 90ms 달성 <b>', evidenceIds: ['e1'] }] }] }, ev, profile, { model: 'm' });

  it('DOCX: 유효한 압축 파일이고 본문에 한글과 합성된 이름이 들어 있어야 합니다', async () => {
    const zip = await JSZip.loadAsync(await buildDocx(doc, profile));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('핵심 역량');
    expect(xml).toContain('김시험');
    expect(xml).toContain('kim@test.invalid');
  });

  it('PPTX: 슬라이드 파일이 만들어지고 한글 제목이 들어 있어야 합니다', async () => {
    const zip = await JSZip.loadAsync(await buildPptx(doc, profile));
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides.length).toBe(2); // 표지 + 섹션 1
    const all = (await Promise.all(slides.map((f) => zip.file(f)!.async('string')))).join('');
    expect(all).toContain('핵심 역량');
  });

  it('PDF용 HTML: 이스케이프되고 연락처가 합성되어야 합니다', () => {
    const html = buildPrintHtml(doc, profile);
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('김시험');
    expect(html).toContain('010-5555-6666');
  });
});
