import { describe, expect, it } from 'vitest';
import {
  compareKeywords, containsTerm, extractKeywords, mergeAiKeywords, suggestAppeals, summarizeMatches,
} from '../src/features/analysis/keywords';
import type { JobDescription, Profile, Project, SourceDocument } from '../src/types';

const jd: JobDescription = {
  id: 'j', company: 'A사', role: 'ML 엔지니어', domain: '오디오', rawText: '', parsedAt: '2026-11-06T00:00:00.000Z',
  sections: {
    qualifications: ['PyTorch 기반 모델 개발 경험', 'Docker 를 이용한 서빙 경험', 'Kubernetes 운영 경험'],
    responsibilities: ['음성 인식 모델 개발 및 서빙', 'MLOps 파이프라인 구축'],
    preferred: ['Rust 경험 우대', 'Docker 컨테이너 최적화'],
  },
};
const project = (id: string, over: Partial<Project>): Project => ({
  id, title: '프로젝트', period: { startDate: '2026-01', isOngoing: false }, role: '개발', techStack: [], description: '', outcomes: [],
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const profile: Profile = { id: 'current-user', name: 'x', title: '', targetRole: '', targetDomains: [], skills: ['Python', 'PyTorch'], updatedAt: '' };
const src = (id: string, title: string, body: string): SourceDocument => ({ id, kind: 'RESUME', title, body, createdAt: '', updatedAt: '' });

describe('키워드 추출 (규칙 기반, 결정적)', () => {
  const kws = extractKeywords({ jd });
  it('자격요건·기술 용어가 높은 순위에 오고, 불용어는 제외되어야 합니다', () => {
    const terms = kws.map((k) => k.term);
    expect(terms.slice(0, 6)).toEqual(expect.arrayContaining(['pytorch', 'docker', 'kubernetes']));
    expect(terms).not.toContain('경험');
    expect(terms).not.toContain('우대');
    expect(terms).not.toContain('and');
    expect(kws[0].weight).toBeGreaterThanOrEqual(kws[kws.length - 1].weight);
  });
  it('같은 입력이면 같은 결과여야 합니다', () => {
    expect(extractKeywords({ jd })).toEqual(kws);
  });
  it('기업 자료의 단어는 출처 표시(COMPANY)와 함께 반영되어야 합니다', () => {
    const k = extractKeywords({ jd, companyText: 'Whisper 와 Whisper 기반 음성 합성, Whisper 파인튜닝' });
    const w = k.find((x) => x.term === 'whisper');
    expect(w?.origins).toEqual(['COMPANY']);
  });
  it('한국어 조사를 떼어 같은 단어로 합쳐야 합니다', () => {
    const k = extractKeywords({ jd: { ...jd, sections: { qualifications: ['서빙을 경험', '서빙이 중요', '서빙 능력'], responsibilities: [], preferred: [] } } });
    expect(k.filter((x) => x.term.startsWith('서빙')).map((x) => x.term)).toEqual(['서빙']);
  });
});

describe('단어 경계', () => {
  it('java 는 javascript 안에서 찾지 않고, c++ 같은 기호 단어와 한글은 찾아야 합니다', () => {
    expect(containsTerm('JavaScript, TypeScript', 'java')).toBe(false);
    expect(containsTerm('Java, Spring', 'java')).toBe(true);
    expect(containsTerm('C++ 와 Rust', 'c++')).toBe(true);
    expect(containsTerm('음성 인식 모델', '음성')).toBe(true);
  });
});

describe('키워드 대조 (직접/간접/확인되지 않음)', () => {
  const projects = [
    project('p1', { title: '음성 서빙', techStack: ['Docker', 'FastAPI'], outcomes: ['MLOps 파이프라인으로 배포 시간 단축'], description: 'Kubernetes 도입을 검토함' }),
    project('p2', { title: '실험', description: 'Rust 로 프로토타입을 만들어 봄' }),
  ];
  const sources = [src('s1', '옛 이력서', 'Rust 학습 경험, Terraform 사용')];
  const kws = extractKeywords({ jd });
  const m = compareKeywords(kws, profile, projects, sources);
  const by = (t: string) => m.find((x) => x.term === t)!;

  it('보유 기술·기술 스택·성과에 있으면 직접, 근거가 연결되어야 합니다', () => {
    expect(by('pytorch').level).toBe('DIRECT');
    expect(by('pytorch').evidence[0]).toMatchObject({ type: 'skill' });
    expect(by('docker').level).toBe('DIRECT');
    expect(by('docker').evidence).toContainEqual({ type: 'project', refId: 'p1', label: '음성 서빙' });
    expect(by('mlops').evidence).toContainEqual({ type: 'outcome', refId: 'p1#0', label: '음성 서빙 성과' });
  });
  it('설명이나 과거 자료에서만 나오면 간접(키워드 과장 금지)이어야 합니다', () => {
    expect(by('kubernetes').level).toBe('INDIRECT');
    expect(by('rust').level).toBe('INDIRECT');
    expect(by('rust').evidence.map((e) => e.type).sort()).toEqual(['project', 'source']);
  });
  it('어디에도 없으면 확인되지 않음이고 근거가 비어야 합니다', () => {
    const k = compareKeywords([{ term: 'terraform', weight: 5, origins: ['JD'] }, { term: '없는단어', weight: 3, origins: ['JD'] }], null, [], []);
    expect(k.map((x) => x.level)).toEqual(['UNCONFIRMED', 'UNCONFIRMED']);
    expect(k[0].evidence).toEqual([]);
  });

  it('어필 후보는 직접 경험만 3~5개, 부족하면 간접으로 보충하고 확인되지 않음은 쓰지 않아야 합니다', () => {
    const picks = suggestAppeals(m);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    expect(picks.length).toBeLessThanOrEqual(5);
    expect(picks.every((p) => p.level !== 'UNCONFIRMED')).toBe(true);
    expect(picks[0].level).toBe('DIRECT');
    const few = suggestAppeals(compareKeywords(kws, null, [project('p3', { techStack: ['Docker'] })], sources));
    expect(few.some((p) => p.level === 'INDIRECT')).toBe(true);
    expect(few.every((p) => p.level !== 'UNCONFIRMED')).toBe(true);
    expect(suggestAppeals([])).toEqual([]);
  });

  it('요약은 장점과 보완점을 근거 건수와 함께 쓰되 합격 가능성을 말하지 않아야 합니다', () => {
    const s = summarizeMatches(m);
    expect(s.strengths.length).toBeGreaterThan(0);
    expect(s.improvements.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toMatch(/합격|확률|가능성이 높/);
    expect(s.improvements.some((x) => x.includes('확인된 경험이 없음') || x.includes('언급됨'))).toBe(true);
  });
});

describe('AI 키워드 병합', () => {
  it('중복은 가중치만 올리고 새 단어는 AI 출처로 추가해야 합니다', () => {
    const base = [{ term: 'pytorch', weight: 10, origins: ['JD' as const] }];
    const r = mergeAiKeywords(base, [{ term: 'PyTorch' }, { term: '음성 모델' }]);
    expect(r.find((k) => k.term === 'pytorch')).toMatchObject({ weight: 11, origins: ['JD', 'AI'] });
    expect(r.find((k) => k.term === '음성 모델')?.origins).toEqual(['AI']);
    expect(base[0].weight).toBe(10); // 원본 불변
  });
});
