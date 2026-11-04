import type { Application, ApplicationStatus } from '../../types';
import { db } from '../../db';

export const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; badgeBg: string; badgeBorder: string; badgeText: string }> = {
  READY: {
    label: '준비중',
    color: 'slate',
    badgeBg: 'bg-slate-100',
    badgeBorder: 'border-slate-200',
    badgeText: 'text-slate-700',
  },
  SUBMITTED: {
    label: '서류제출',
    color: 'blue',
    badgeBg: 'bg-blue-50',
    badgeBorder: 'border-blue-200',
    badgeText: 'text-blue-700',
  },
  INTERVIEW: {
    label: '면접진행',
    color: 'indigo',
    badgeBg: 'bg-indigo-50',
    badgeBorder: 'border-indigo-200',
    badgeText: 'text-indigo-700',
  },
  ACCEPTED: {
    label: '최종합격',
    color: 'emerald',
    badgeBg: 'bg-emerald-50',
    badgeBorder: 'border-emerald-200',
    badgeText: 'text-emerald-700',
  },
  REJECTED: {
    label: '불합격',
    color: 'rose',
    badgeBg: 'bg-rose-50',
    badgeBorder: 'border-rose-200',
    badgeText: 'text-rose-700',
  },
};

export const STATUS_COLUMNS: ApplicationStatus[] = [
  'READY',
  'SUBMITTED',
  'INTERVIEW',
  'ACCEPTED',
  'REJECTED',
];

/**
 * 시연용 샘플 지원 이력 시딩 헬퍼
 */
export async function seedSampleApplicationsIfEmpty(): Promise<void> {
  const count = await db.applications.count();
  if (count > 0) return;

  const now = new Date();
  const dateStr = (offsetDays: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
  };

  const sampleApps: Application[] = [
    {
      id: 'app-sample-1',
      company: '예시클라우드',
      role: 'AI Applied Engineer (오디오/음성)',
      domain: '소리 & 오디오',
      status: 'INTERVIEW',
      appliedDate: dateStr(12),
      notes: '1차 실무 인터뷰 통과 후 2차 컬처핏 인터뷰 일정 조율 중. 모델 경량화 경험 질문 집중 대비 필요.',
      snapshot: {
        jdSnapshot: {
          id: 'jd-snap-1',
          company: '예시클라우드',
          role: 'AI Applied Engineer',
          domain: '소리 & 오디오',
          rawText: '[예시클라우드] 오디오 생성 AI 엔지니어 공고 원문',
          sections: {
            responsibilities: ['초거대 오디오 생성 AI 모델 서빙 최적화', 'ONNX Runtime 지연시간 단축'],
            qualifications: ['PyTorch 기반 모델 개발 2년 이상', '컨테이너 배포 경험'],
            preferred: ['오디오/DSP 신호처리 경험자'],
          },
          parsedAt: new Date(now.getTime() - 15 * 86400000).toISOString(),
        },
        resumeText: '초저지연 음성 양자화 모델 개발을 통해 추론 속도를 35% 단축한 경험을 바탕으로 기여하겠습니다.',
        portfolioUrl: 'https://github.com/example/sample-portfolio',
        analysisSnapshot: {
          id: 'analysis-snap-1',
          jdId: 'jd-snap-1',
          directMatches: [
            {
              requirement: 'ONNX Runtime 지연시간 단축',
              matchedSkillOrExperience: 'ONNX Runtime 양자화로 지연시간 35% 단축',
              description: '프로젝트 성과에서 직접 증명되었습니다.',
            },
          ],
          indirectMatches: [
            {
              requirement: '컨테이너 배포 경험',
              matchedSkillOrExperience: 'DOCKER, KUBERNETES',
              description: '인프라 구축 경험으로 어필 가능합니다.',
            },
          ],
          evidenceGaps: [
            {
              requirement: '오디오/DSP 신호처리 경험자',
              missingReason: '전문 신호처리 실무 불릿 부족',
              actionGuide: '기초 오디오 특징 추출(MFCC) 실습 경험을 어필하세요.',
            },
          ],
          summaryScore: 82,
          analyzedAt: new Date(now.getTime() - 15 * 86400000).toISOString(),
        },
        snapshotTimestamp: new Date(now.getTime() - 12 * 86400000).toISOString(),
      },
      createdAt: new Date(now.getTime() - 12 * 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
    },
    {
      id: 'app-sample-2',
      company: '샘플소프트',
      role: 'MLOps Engineer',
      domain: '미디어 & 생성형 AI',
      status: 'SUBMITTED',
      appliedDate: dateStr(5),
      notes: '원티드를 통해 서류 접수 완료. 결과 대기 중.',
      snapshot: {
        jdSnapshot: {
          id: 'jd-snap-2',
          company: '샘플소프트',
          role: 'MLOps Engineer',
          domain: '미디어 & 생성형 AI',
          rawText: '[샘플소프트] MLOps 엔지니어 채용 공고 원문',
          sections: {
            responsibilities: ['대규모 모델 학습 및 서빙 파이프라인 자동화'],
            qualifications: ['Docker, Kubernetes 활용 실무 경험', 'CI/CD 파이프라인 구축 경험'],
            preferred: ['Kubeflow 또는 MLflow 운영 경험'],
          },
          parsedAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
        },
        resumeText: 'FastAPI와 Docker 기반 마이크로서비스 인프라를 안정적으로 운영한 경험을 기술하였습니다.',
        portfolioUrl: 'https://github.com/example',
        analysisSnapshot: {
          id: 'analysis-snap-2',
          jdId: 'jd-snap-2',
          directMatches: [],
          indirectMatches: [
            {
              requirement: 'Docker, Kubernetes 활용 실무 경험',
              matchedSkillOrExperience: 'DOCKER, KUBERNETES',
              description: '관련 기술 스택을 활용한 프로젝트가 있습니다.',
            },
          ],
          evidenceGaps: [
            {
              requirement: 'Kubeflow 또는 MLflow 운영 경험',
              missingReason: '운영 경험 부재',
              actionGuide: '로컬 환경 구축 경험으로 보완하세요.',
            },
          ],
          summaryScore: 65,
          analyzedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        },
        snapshotTimestamp: new Date(now.getTime() - 5 * 86400000).toISOString(),
      },
      createdAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
    },
  ];

  await db.applications.bulkAdd(sampleApps);
}
