import { describe, it, expect } from 'vitest';
import {
  mapRowsToProjects,
  parseCsv,
  parsePeriod,
  parseSource,
  suggestMappings,
  validateMappings,
} from '../src/features/notion/notionAdapter';

const CSV = `프로젝트명,사용기술,진행기간,핵심 성과,GitHub
음향 탐지,"Python, PyTorch",2024-03 → 2024-09,"지연 180ms에서 45ms로 단축, F1 0.91",https://github.com/a/b
JD 분석기,"React, TypeScript",2024-10 → 현재,정규식 파서 구현,https://github.com/a/c
`;

describe('노션 동적 스키마 어댑터 (Phase 3-6)', () => {
  it('CSV의 따옴표·쉼표·개행을 올바르게 파싱해야 합니다', () => {
    const t = parseCsv('a,b\n"x, y","line1\nline2"\n');
    expect(t).toEqual([['a', 'b'], ['x, y', 'line1\nline2']]);
  });

  it('CSV 헤더에서 스키마를 감지하고 한국어 컬럼을 자동 매핑해야 합니다', () => {
    const r = parseSource(CSV);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.rows).toHaveLength(2);
    const m = suggestMappings(r.data.schema.properties);
    expect(m.title).toBe('프로젝트명');
    expect(m.techStack).toBe('사용기술');
    expect(m.period).toBe('진행기간');
    expect(m.outcomes).toBe('핵심 성과');
    expect(m.links).toBe('GitHub');
    expect(validateMappings(m, r.data.schema.properties)).toEqual([]);
  });

  it('매핑대로 Project로 변환하고 성과 문장의 쉼표는 보존해야 합니다', () => {
    const r = parseSource(CSV);
    if (!r.ok) throw new Error('parse failed');
    const m = suggestMappings(r.data.schema.properties);
    let n = 0;
    const { projects, skipped } = mapRowsToProjects(r.data.rows, m, [], new Date('2026-11-04T00:00:00Z'), () => `id-${++n}`);
    expect(skipped).toHaveLength(0);
    expect(projects[0].techStack).toEqual(['Python', 'PyTorch']);
    expect(projects[0].outcomes).toEqual(['지연 180ms에서 45ms로 단축, F1 0.91']);
    expect(projects[0].period).toEqual({ startDate: '2024-03', endDate: '2024-09', isOngoing: false });
    expect(projects[1].period).toEqual({ startDate: '2024-10', isOngoing: true });
    expect(projects[0].links?.[0].url).toBe('https://github.com/a/b');
  });

  it('이미 있는 제목과 빈 제목 행은 건너뛰어야 합니다 (재가져오기 안전)', () => {
    const r = parseSource(CSV);
    if (!r.ok) throw new Error('parse failed');
    const m = suggestMappings(r.data.schema.properties);
    const { projects, skipped } = mapRowsToProjects(r.data.rows, m, ['음향 탐지']);
    expect(projects).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('노션 API 쿼리 응답 JSON에서 스키마와 값을 추출해야 합니다', () => {
    const api = {
      object: 'list',
      results: [
        {
          properties: {
            Name: { id: 't', type: 'title', title: [{ plain_text: 'Robot Arm' }] },
            Stack: { id: 's', type: 'multi_select', multi_select: [{ name: 'ROS' }, { name: 'C++' }] },
            When: { id: 'd', type: 'date', date: { start: '2024-01-10', end: '2024-05-02' } },
            Impact: { id: 'i', type: 'rich_text', rich_text: [{ plain_text: '정밀도 12% 향상' }] },
          },
        },
      ],
    };
    const r = parseSource(JSON.stringify(api));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.schema.properties.map((p) => p.type)).toEqual(['title', 'multi_select', 'date', 'rich_text']);
    const m = suggestMappings(r.data.schema.properties);
    expect(m).toMatchObject({ title: 'Name', techStack: 'Stack', period: 'When', outcomes: 'Impact' });
    const { projects } = mapRowsToProjects(r.data.rows, m);
    expect(projects[0].techStack).toEqual(['ROS', 'C++']);
    expect(projects[0].period).toEqual({ startDate: '2024-01', endDate: '2024-05', isOngoing: false });
  });

  it('필수 매핑 누락과 중복 매핑을 검증해야 합니다', () => {
    const props = [
      { id: '1', name: 'A', type: 'title' },
      { id: '2', name: 'B', type: 'rich_text' },
    ];
    const errs = validateMappings({ title: 'A', techStack: 'A', period: '', outcomes: 'B' }, props);
    expect(errs.some((e) => e.includes('기간'))).toBe(true);
    expect(errs.some((e) => e.includes('중복'))).toBe(true);
  });

  it('빈 입력과 잘못된 JSON은 오류를 반환해야 합니다', () => {
    expect(parseSource('  ').ok).toBe(false);
    expect(parseSource('{broken').ok).toBe(false);
  });

  it('종료일이 없는 단일 날짜 기간을 처리해야 합니다', () => {
    expect(parsePeriod(['2024-03-15'])).toEqual({ startDate: '2024-03', endDate: '2024-03', isOngoing: false });
  });
});
