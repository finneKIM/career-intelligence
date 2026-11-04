import { describe, it, expect } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackup,
  parseBackup,
  summarizeBackup,
  type BackupFile,
} from '../src/features/backup/backupService';

const empty = {
  profiles: [],
  projects: [],
  jobDescriptions: [],
  applications: [],
  analysisResults: [],
  notionConfigs: [],
};

describe('백업/복원 (Phase 3-7)', () => {
  it('내보내기 → 파싱 왕복 시 데이터가 동일해야 합니다', () => {
    const backup = buildBackup({ ...empty, projects: [{ id: 'p1', title: 'A' }] }, new Date('2026-11-04T00:00:00Z'));
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.tables.projects).toEqual([{ id: 'p1', title: 'A' }]);
      expect(parsed.backup.version).toBe(BACKUP_VERSION);
    }
  });

  it('노션 API 키는 백업에서 제거되어야 합니다', () => {
    const backup = buildBackup({
      ...empty,
      notionConfigs: [{ id: 'c', apiConfig: { apiKey: 'secret_xxx', databaseId: 'd' } }],
    });
    expect(JSON.stringify(backup)).not.toContain('secret_xxx');
  });

  it('잘못된 파일은 명확한 오류로 거부해야 합니다', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('{"format":"other"}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 999, tables: {} })).ok).toBe(false);
    expect(
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 2, tables: { projects: [{ title: 'no id' }] } })).ok,
    ).toBe(false);
  });

  it('초기 버전(profile + projects) 백업과 호환되어야 합니다', () => {
    const legacy = { profile: { id: 'current-user' }, projects: [{ id: 'p1' }], version: '1.0' };
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.tables.profiles).toHaveLength(1);
      expect(parsed.backup.tables.projects).toHaveLength(1);
    }
  });

  it('요약은 테이블별 건수와 합계를 계산해야 합니다', () => {
    const b: BackupFile = buildBackup({ ...empty, projects: [{ id: '1' }, { id: '2' }], applications: [{ id: 'a' }] });
    const s = summarizeBackup(b, 'merge');
    expect(s.counts.projects).toBe(2);
    expect(s.total).toBe(3);
  });
});
