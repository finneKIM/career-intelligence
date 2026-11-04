import Dexie, { type Table } from 'dexie';
import type { 
  Profile, 
  Project, 
  JobDescription, 
  Application, 
  AnalysisResult,
  NotionMappingConfig 
} from '../types';

/**
 * Career Intelligence 로컬 퍼스트 데이터베이스 (IndexedDB 래퍼)
 * Dexie.js를 기반으로 모든 구직자 데이터를 브라우저 내에 안전하게 보관합니다.
 */
export class CareerIntelDB extends Dexie {
  profiles!: Table<Profile, string>;
  projects!: Table<Project, string>;
  jobDescriptions!: Table<JobDescription, string>;
  applications!: Table<Application, string>;
  analysisResults!: Table<AnalysisResult, string>;
  notionConfigs!: Table<NotionMappingConfig, string>;

  constructor() {
    super('CareerIntelligenceDB');

    // 스키마 버전 1 정의 (인덱싱할 주요 검색/정렬 필드 지정)
    this.version(1).stores({
      profiles: 'id, updatedAt',
      projects: 'id, title, role, createdAt, updatedAt, *techStack',
      jobDescriptions: 'id, company, role, domain, parsedAt',
      applications: 'id, company, role, status, appliedDate, createdAt, updatedAt',
      analysisResults: 'id, jdId, analyzedAt, summaryScore',
      notionConfigs: 'id, lastSyncedAt',
    });
  }
}

// 싱글톤 DB 인스턴스 생성 및 export
export const db = new CareerIntelDB();

/**
 * 초기 구직자 기본 프로필 조회 또는 기본값 생성 헬퍼
 */
export async function getOrCreateDefaultProfile(): Promise<Profile> {
  const DEFAULT_PROFILE_ID = 'current-user';
  const existing = await db.profiles.get(DEFAULT_PROFILE_ID);

  if (existing) {
    return existing;
  }

  const defaultProfile: Profile = {
    id: DEFAULT_PROFILE_ID,
    name: '구직자 (기본 프로필)',
    title: 'AI 엔지니어 / 풀스택 개발자',
    targetRole: 'AI Applied Engineer',
    targetDomains: ['소리 & 오디오', '미디어 & 생성형 AI', '개발 생산성'],
    skills: ['Python', 'TypeScript', 'PyTorch', 'React', 'FastAPI', 'Docker'],
    updatedAt: new Date().toISOString(),
  };

  await db.profiles.put(defaultProfile);
  return defaultProfile;
}

/**
 * 개발 및 테스트용 샘플 프로젝트 데이터 시딩 헬퍼
 */
export async function seedSampleProjectsIfEmpty(): Promise<void> {
  const count = await db.projects.count();
  if (count > 0) return;

  const sampleProjects: Project[] = [
    {
      id: 'sample-proj-1',
      title: '음향 이벤트 탐지 및 실시간 분류 파이프라인 구축',
      period: {
        startDate: '2024-03',
        endDate: '2024-09',
        isOngoing: false,
      },
      role: 'AI 엔지니어 (개인 프로젝트)',
      techStack: ['Python', 'PyTorch', 'FastAPI', 'Docker', 'Librosa'],
      description: '실시간 마이크 입력으로부터 특정 환경 소음(경적, 사이렌, 유리 파편)을 분류하는 경량화 모델 파이프라인 개발',
      outcomes: [
        'Conformer 및 MobileNetV3 기반 모델 경량화를 통해 단말 추론 지연 시간을 180ms에서 45ms로 75% 단축',
        'F1-score 0.91 달성 및 FastAPI 기반 실시간 웹소켓 추론 서버 도커 컨테이너화 배포 완료',
        '데이터 증강(SpecAugment, Mixup) 기법을 적용하여 배경 소음 노이즈 환경 정확도 14%p 개선',
      ],
      links: [
        { title: 'GitHub Repository', url: 'https://github.com/example/audio-event-detection' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sample-proj-2',
      title: '대용량 채용 공고(JD) 역량 매칭 및 시각화 웹 서비스',
      period: {
        startDate: '2024-10',
        endDate: '2025-01',
        isOngoing: false,
      },
      role: '풀스택 리드 개발자',
      techStack: ['React', 'TypeScript', 'Tailwind CSS', 'IndexedDB', 'Dexie.js', 'Vite'],
      description: '채용 공고의 자격 요건과 구직자 포트폴리오를 대조 분석하는 로컬 퍼스트 SPA 웹 애플리케이션',
      outcomes: [
        '브라우저 내장 IndexedDB와 Dexie.js를 결합해 완전 무서버 로컬 퍼스트 아키텍처 구현 (데이터 유출 0%)',
        '정규식 기반 JD 섹션 자동 분할 알고리즘을 설계하여 복사-붙여넣기 텍스트 구조화 성공률 96% 달성',
      ],
      links: [
        { title: 'Demo Web', url: 'https://example-demo.app' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  await db.projects.bulkAdd(sampleProjects);
}
