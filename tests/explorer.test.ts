import { describe, it, expect } from 'vitest';
import { calculateRoleDomainMatrix, TARGET_ROLES, TARGET_DOMAINS } from '../src/features/explorer/explorerEngine';
import type { Project } from '../src/types';

describe('Career Explorer Engine Tests', () => {
  const sampleSkills = ['PyTorch', 'FastAPI', 'Docker', 'ONNX', 'Python'];

  const sampleProjects: Project[] = [
    {
      id: 'proj-audio',
      title: '오디오 모델 경량화',
      period: { startDate: '2024-01', isOngoing: false },
      role: 'AI Applied Engineer',
      techStack: ['PyTorch', 'ONNX', 'STT/TTS'],
      description: '음성 합성 모델 서빙',
      outcomes: ['지연시간 35% 단축'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  it('4개 직무 x 4개 도메인 = 총 16개의 매트릭스 셀이 정확히 생성되어야 합니다', () => {
    const matrix = calculateRoleDomainMatrix(sampleSkills, sampleProjects);
    expect(matrix).toHaveLength(16);

    TARGET_ROLES.forEach(role => {
      TARGET_DOMAINS.forEach(domain => {
        const cell = matrix.find(c => c.role === role && c.domain === domain);
        expect(cell).toBeDefined();
        expect(cell?.score).toBeGreaterThanOrEqual(0);
        expect(cell?.score).toBeLessThanOrEqual(100);
      });
    });
  });

  it('보유 기술(PyTorch, ONNX, STT/TTS)과 직접 연관된 [AI Applied Engineer x 소리 & 오디오] 셀은 높은 점수를 받아야 합니다', () => {
    const matrix = calculateRoleDomainMatrix(sampleSkills, sampleProjects);
    const audioAppliedCell = matrix.find(
      c => c.role === 'AI Applied Engineer' && c.domain === '소리 & 오디오'
    );

    expect(audioAppliedCell).toBeDefined();
    expect(audioAppliedCell?.matchedSkills).toContain('PyTorch');
    expect(audioAppliedCell?.matchedSkills).toContain('ONNX');
    expect(audioAppliedCell?.score).toBeGreaterThanOrEqual(55);
    expect(audioAppliedCell?.readiness).toBe('HIGH');
  });

  it('보유 기술이 전혀 없는 [로보틱스] 관련 셀은 점수가 낮고 GROWTH 단계여야 합니다', () => {
    const matrix = calculateRoleDomainMatrix(['Python'], []);
    const roboticsCell = matrix.find(
      c => c.role === 'AI Engineer' && c.domain === '로보틱스 & 자율주행'
    );

    expect(roboticsCell).toBeDefined();
    expect(roboticsCell?.readiness).toBe('GROWTH');
    expect(roboticsCell?.missingSkills).toContain('ROS');
    expect(roboticsCell?.missingSkills).toContain('SLAM');
  });

  it('각 셀마다 실천 가능한 학습 로드맵(roadmapSteps)이 최소 2단계 이상 포함되어야 합니다', () => {
    const matrix = calculateRoleDomainMatrix(sampleSkills, sampleProjects);
    matrix.forEach(cell => {
      expect(cell.roadmapSteps.length).toBeGreaterThanOrEqual(2);
      expect(cell.actionGuide).toBeTruthy();
    });
  });
});
