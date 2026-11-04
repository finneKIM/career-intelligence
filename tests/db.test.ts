import { describe, it, expect } from 'vitest';
import { db } from '../src/db';
import type { Profile } from '../src/types';

describe('CareerIntelDB Schema & Type Definition Test', () => {
  it('데이터베이스 인스턴스가 정상적으로 생성되어야 합니다', () => {
    expect(db.name).toBe('CareerIntelligenceDB');
    expect(db.tables.length).toBeGreaterThanOrEqual(6);
  });

  it('주요 테이블 6개가 정의되어 있어야 합니다', () => {
    const tableNames = db.tables.map(t => t.name);
    expect(tableNames).toContain('profiles');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('jobDescriptions');
    expect(tableNames).toContain('applications');
    expect(tableNames).toContain('analysisResults');
    expect(tableNames).toContain('notionConfigs');
  });

  it('타입 인터페이스 객체가 타입 규격에 부합해야 합니다', () => {
    const sampleProfile: Profile = {
      id: 'current-user',
      name: '홍길동',
      title: 'AI 엔지니어',
      targetRole: 'AI Applied Engineer',
      targetDomains: ['소리 & 오디오'],
      skills: ['Python', 'PyTorch'],
      updatedAt: new Date().toISOString(),
    };

    expect(sampleProfile.id).toBe('current-user');
    expect(sampleProfile.skills).toHaveLength(2);
  });
});
