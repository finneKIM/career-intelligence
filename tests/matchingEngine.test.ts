import { describe, it, expect } from 'vitest';
import { analyzeJobDescriptionMatch } from '../src/features/matching/matchingEngine';
import type { Profile, Project, JobDescription } from '../src/types';

describe('3-Stage Matching Engine Tests', () => {
  const sampleProfile: Profile = {
    id: 'current-user',
    name: '이지은',
    title: '데이터 중심 실전형 AI 엔지니어',
    targetRole: 'AI Applied Engineer',
    targetDomains: ['소리 & 오디오'],
    skills: ['PyTorch', 'FastAPI', 'Docker', 'ONNX', 'Kubernetes'],
    updatedAt: new Date().toISOString(),
  };

  const sampleProjects: Project[] = [
    {
      id: 'proj-1',
      title: '초저지연 온디바이스 음성 모델 양자화',
      period: {
        startDate: '2024-01',
        endDate: '2024-06',
        isOngoing: false,
      },
      role: 'AI 엔지니어 (모델 경량화)',
      techStack: ['PyTorch', 'ONNX', 'TensorRT'],
      description: '음성 합성 모델의 모바일 서빙을 위한 경량화 프로젝트',
      outcomes: [
        'ONNX Runtime 양자화로 지연시간 35% 단축 (120ms -> 78ms)',
        'PyTorch 기반 실시간 오디오 스트리밍 파이프라인 개발',
      ],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'proj-2',
      title: '마이크로서비스 기반 모델 배포 환경 구축',
      period: {
        startDate: '2023-06',
        endDate: '2023-12',
        isOngoing: false,
      },
      role: '백엔드/인프라 담당',
      techStack: ['FastAPI', 'Docker', 'Kubernetes'],
      description: 'AI 모델 서빙을 위한 컨테이너 인프라',
      outcomes: [
        'FastAPI 비동기 엔드포인트 설계로 동시 처리량 2배 개선',
      ],
      links: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const sampleJd: JobDescription = {
    id: 'jd-sample',
    company: '예시클라우드',
    role: 'AI Applied Engineer',
    domain: '소리 & 오디오',
    rawText: '샘플 공고',
    sections: {
      responsibilities: [
        '초거대 생성형 AI 모델 기반 음성 합성 파이프라인 개발',
        'ONNX Runtime 추론 지연시간 개선',
      ],
      qualifications: [
        'PyTorch 기반 딥러닝 모델 개발 및 서빙 경험',
        'Kubernetes 기반 컨테이너 배포 경험',
      ],
      preferred: [
        'ICASSP 등 글로벌 학회 논문 게재 경험',
      ],
    },
    parsedAt: new Date().toISOString(),
  };

  it('성과 불릿에 증거가 명시된 항목은 🟢 Direct Match로 분류되어야 합니다', () => {
    const result = analyzeJobDescriptionMatch(sampleJd, sampleProjects, sampleProfile);

    // ONNX Runtime, 음성 합성, PyTorch 관련 항목이 directMatches에 포함되어야 함
    expect(result.directMatches.length).toBeGreaterThanOrEqual(1);
    const onnxMatch = result.directMatches.find(m => m.requirement.includes('ONNX'));
    expect(onnxMatch).toBeDefined();
    expect(onnxMatch?.matchedSkillOrExperience).toContain('ONNX Runtime 양자화로 지연시간 35% 단축');
  });

  it('성과 불릿에는 없으나 기술 스택에 포함된 항목은 🔵 Indirect Match로 분류되어야 합니다', () => {
    const result = analyzeJobDescriptionMatch(sampleJd, sampleProjects, sampleProfile);

    // Kubernetes는 proj-2의 techStack에는 있으나 outcomes에는 구체적 수치 불릿이 없음
    const k8sMatch = result.indirectMatches.find(m => m.requirement.includes('Kubernetes'));
    expect(k8sMatch).toBeDefined();
    expect(k8sMatch?.description).toContain('프로젝트에서 해당 기술');
  });

  it('경험 및 기술 근거가 전혀 없는 항목은 🟠 Evidence Gap으로 분류되어야 합니다', () => {
    const result = analyzeJobDescriptionMatch(sampleJd, sampleProjects, sampleProfile);

    // ICASSP 글로벌 학회 논문 경험은 보유 자산에 전혀 없음
    const paperGap = result.evidenceGaps.find(g => g.requirement.includes('ICASSP'));
    expect(paperGap).toBeDefined();
    expect(paperGap?.missingReason).toContain('실무 증빙을 확인하기 어렵습니다');
    expect(paperGap?.actionGuide).toBeDefined();
  });

  it('점수가 0~100 사이의 객관적 역량 충족도 수치로 정확히 산출되어야 합니다', () => {
    const result = analyzeJobDescriptionMatch(sampleJd, sampleProjects, sampleProfile);

    expect(result.summaryScore).toBeGreaterThanOrEqual(0);
    expect(result.summaryScore).toBeLessThanOrEqual(100);
    expect(typeof result.summaryScore).toBe('number');
  });
});
