import { describe, expect, it } from 'vitest';
import { appealEvidenceIds, buildEvidence, buildGeneratePayload, toGeneratedDocument } from '../src/features/documents/documentService';
import { compareKeywords } from '../src/features/analysis/keywords';
import { buildPrompt, validateGenerated } from '../server/prompts';
import type { JobDescription, Profile, Project } from '../src/types';

const profile: Profile = { id: 'current-user', name: '기본', title: '', targetRole: '', targetDomains: [], skills: ['Python'], updatedAt: '' };
const proj = (id: string, title: string, over: Partial<Project> = {}): Project => ({
  id, title, period: { startDate: '2026-01', isOngoing: false }, role: '개발', techStack: [], description: '', outcomes: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const jd: JobDescription = {
  id: 'j', company: 'A사', role: 'ML', domain: '', rawText: '', parsedAt: '',
  sections: { qualifications: ['Docker 서빙'], responsibilities: [], preferred: [] },
};
const projects = [
  proj('p1', '서빙 플랫폼', { techStack: ['Docker'], outcomes: ['배포 시간 40% 단축', 'Docker 이미지 용량 감소'] }),
  proj('p2', '무관한 앱', { techStack: ['Swift'] }),
];

describe('어필 포인트 → 근거 ID 연결 (6-E)', () => {
  const ev = buildEvidence(jd, projects, profile);
  const [docker] = compareKeywords([{ term: 'docker', weight: 6, origins: ['JD'] }], profile, projects, []);

  it('어필 포인트의 근거(프로젝트·성과)가 근거 목록의 ID로 이어져야 합니다', () => {
    const ids = appealEvidenceIds(docker, ev);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const picked = ev.filter((e) => ids.includes(e.id));
    expect(picked.some((e) => e.type === 'project' && e.refId === 'p1')).toBe(true);
    expect(picked.some((e) => e.type === 'outcome' && e.refId === 'p1#1')).toBe(true);
    expect(picked.every((e) => e.refId.startsWith('p1') || e.type === 'skill')).toBe(true);
  });

  it('페이로드에 어필 포인트가 근거 ID와 함께 들어가고, 없으면 필드 자체가 없어야 합니다', () => {
    const withA = buildGeneratePayload(jd, ev, null, [], [docker]) as { appealPoints?: { term: string; level: string; evidenceIds: string[] }[] };
    expect(withA.appealPoints?.[0]).toMatchObject({ term: 'docker', level: 'DIRECT' });
    expect(withA.appealPoints?.[0].evidenceIds.length).toBeGreaterThan(0);
    expect('appealPoints' in buildGeneratePayload(jd, ev, null, [])).toBe(false);
  });

  it('어필 근거 프로젝트는 근거 개수 제한이 있어도 먼저 담겨야 합니다', () => {
    const many = [...Array.from({ length: 30 }, (_, i) => proj(`x${i}`, `다른 ${i}`, { techStack: ['Docker', 'Python'], outcomes: ['a', 'b'] })), proj('target', '대상', { techStack: ['Rare'], outcomes: ['희귀 성과'] })];
    const without = buildEvidence(jd, many, profile, 10);
    expect(without.some((e) => e.refId.startsWith('target'))).toBe(false);
    const withPrefer = buildEvidence(jd, many, profile, 10, ['target']);
    expect(withPrefer.some((e) => e.refId.startsWith('target'))).toBe(true);
  });

  it('생성 문서에 사용한 어필 포인트가 기록되어야 합니다', () => {
    const doc = toGeneratedDocument('RESUME', jd, { dropped: 0, sections: [{ heading: 'h', paragraphs: [{ text: 't', evidenceIds: [ev[0].id] }] }] }, ev, profile, {
      model: 'm', appealPoints: [{ term: 'docker', level: 'DIRECT' }],
    });
    expect(doc.appealPoints).toEqual([{ term: 'docker', level: 'DIRECT' }]);
    expect('appealPoints' in toGeneratedDocument('RESUME', jd, { dropped: 0, sections: [{ heading: 'h', paragraphs: [{ text: 't', evidenceIds: [ev[0].id] }] }] }, ev, profile, { model: 'm' })).toBe(false);
  });

  it('서버 프롬프트에 어필 포인트와 간접 경험 주의 규칙이 들어가고, 날조 차단 검증은 그대로여야 합니다', () => {
    const payload = buildGeneratePayload(jd, ev, null, [], [docker]);
    const p = buildPrompt('generate-resume', payload) as { user: string };
    expect(p.user).toContain('[어필 포인트(우선 강조)]');
    expect(p.user).toContain('docker (직접 경험)');
    expect(p.user).toContain('간접 경험은 직접 경험처럼 쓰지 말고');
    const e = payload.evidence;
    const r = validateGenerated({ sections: [{ heading: 'x', paragraphs: [{ text: 'Docker 이미지 용량을 99% 줄였습니다', evidenceIds: [e[1].id] }] }] }, e) ;
    expect(r).toBeNull(); // 근거에 없는 새 수치(99%)는 어필 포인트가 있어도 차단
  });
});
