import type { JobDescription, AnalysisResult } from './analysis';

export type ApplicationStatus = 'READY' | 'SUBMITTED' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED';

export interface ApplicationSnapshot {
  jdSnapshot: JobDescription; // 당시 공고 원본
  resumeText: string; // 당시 제출한 자기소개서 전문
  portfolioUrl?: string; // 포트폴리오 링크
  analysisSnapshot: AnalysisResult; // 당시 매칭 분석 결과
  snapshotTimestamp: string; // 스냅샷 생성 일시 (ISO String)
}

export interface Application {
  id: string; // 고유 ID (UUID)
  company: string; // 지원 회사명
  role: string; // 지원 직무
  domain: string; // 지원 산업/도메인
  status: ApplicationStatus; // 지원 상태
  appliedDate?: string; // 지원 일자 ('YYYY-MM-DD')
  notes?: string; // 진행 메모

  // ★ 불변 스냅샷 (당시 지원 시점의 자료를 온전히 보존)
  snapshot: ApplicationSnapshot;

  createdAt: string; // 등록 일시 (ISO String)
  updatedAt: string; // 수정 일시 (ISO String)
}
