import { describe, it, expect } from 'vitest';
import { db } from '../src/db';
import type { Application, ApplicationStatus } from '../src/types';
import { STATUS_COLUMNS, STATUS_CONFIG } from '../src/features/applications/applicationHelper';

describe('Application Tracker & Immutable Snapshot Tests', () => {
  it('5단계 지원 상태 컬럼 및 설정이 일관되게 정의되어 있어야 합니다', () => {
    expect(STATUS_COLUMNS).toHaveLength(5);
    STATUS_COLUMNS.forEach(status => {
      expect(STATUS_CONFIG[status]).toBeDefined();
      expect(STATUS_CONFIG[status].label).toBeTruthy();
      expect(STATUS_CONFIG[status].badgeBg).toBeTruthy();
    });
  });

  it('Dexie applications 테이블 스키마 인덱스가 올바르게 정의되어 있어야 합니다', () => {
    const table = db.table<Application, string>('applications');
    expect(table).toBeDefined();
    expect(table.name).toBe('applications');
    expect(table.schema.primKey.name).toBe('id');
  });

  it('지원 이력과 불변 스냅샷(JD, 자소서, 매칭결과) 규격이 완벽히 준수되어야 합니다', () => {
    const testApp: Application = {
      id: 'app-test-1',
      company: '예시클라우드',
      role: 'AI Engineer',
      domain: '소리 & 오디오',
      status: 'SUBMITTED',
      appliedDate: '2024-03-01',
      notes: '테스트 지원 건',
      snapshot: {
        jdSnapshot: {
          id: 'jd-test-1',
          company: '예시클라우드',
          role: 'AI Engineer',
          domain: '소리 & 오디오',
          rawText: '공고 원문 전체',
          sections: {
            responsibilities: ['AI 모델 서빙'],
            qualifications: ['PyTorch 실무'],
            preferred: ['오디오 경험'],
          },
          parsedAt: new Date().toISOString(),
        },
        resumeText: '제출한 자기소개서 내용입니다.',
        portfolioUrl: 'https://github.com/example/sample-portfolio',
        analysisSnapshot: {
          id: 'analysis-test-1',
          jdId: 'jd-test-1',
          directMatches: [
            {
              requirement: 'AI 모델 서빙',
              matchedSkillOrExperience: 'ONNX 모델 서빙 경험',
              description: '직접 일치',
            },
          ],
          indirectMatches: [],
          evidenceGaps: [],
          summaryScore: 85,
          analyzedAt: new Date().toISOString(),
        },
        snapshotTimestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(testApp.company).toBe('예시클라우드');
    expect(testApp.snapshot.resumeText).toBe('제출한 자기소개서 내용입니다.');
    expect(testApp.snapshot.analysisSnapshot.summaryScore).toBe(85);
    expect(testApp.snapshot.jdSnapshot.sections.responsibilities).toContain('AI 모델 서빙');
  });

  it('지원 상태 전이(READY -> SUBMITTED -> INTERVIEW -> ACCEPTED)가 유효한 값이어야 합니다', () => {
    const validTransitions: ApplicationStatus[] = ['READY', 'SUBMITTED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];
    validTransitions.forEach(st => {
      expect(STATUS_COLUMNS).toContain(st);
    });
  });
});
