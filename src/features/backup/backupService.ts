import { db } from '../../db';

export const BACKUP_FORMAT = 'career-intelligence-backup';
export const BACKUP_VERSION = 2;

/** 백업 대상 테이블 (notionConfigs의 API 토큰은 보안상 제외) */
export const BACKUP_TABLES = [
  'profiles',
  'projects',
  'jobDescriptions',
  'applications',
  'analysisResults',
  'notionConfigs',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<BackupTableName, Record<string, unknown>[]>;
}

export type RestoreMode = 'replace' | 'merge';

export interface RestoreSummary {
  mode: RestoreMode;
  counts: Record<BackupTableName, number>;
  total: number;
}

/** 민감 정보(노션 API 키)를 제거한 복사본을 반환 */
export function sanitizeRecord(table: BackupTableName, record: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'notionConfigs') return record;
  const copy = { ...record };
  const api = copy.apiConfig as Record<string, unknown> | undefined;
  if (api) copy.apiConfig = { ...api, apiKey: '' };
  return copy;
}

export function buildBackup(
  tables: Record<BackupTableName, Record<string, unknown>[]>,
  now: Date = new Date(),
): BackupFile {
  const sanitized = {} as BackupFile['tables'];
  for (const name of BACKUP_TABLES) {
    sanitized[name] = (tables[name] ?? []).map((r) => sanitizeRecord(name, r));
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tables: sanitized,
  };
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string };

/**
 * 백업 JSON 텍스트를 검증하여 BackupFile로 변환.
 * 구버전 포맷(`{ profile, projects }`, App.tsx 초기 내보내기)도 호환 처리한다.
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '올바른 JSON 파일이 아닙니다.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '백업 파일 형식이 올바르지 않습니다.' };
  }
  const obj = raw as Record<string, unknown>;

  // 레거시 포맷 (version '1.0': profile + projects)
  if (obj.format === undefined && ('projects' in obj || 'profile' in obj)) {
    const tables = emptyTables();
    if (obj.profile && typeof obj.profile === 'object') tables.profiles = [obj.profile as Record<string, unknown>];
    if (Array.isArray(obj.projects)) tables.projects = obj.projects as Record<string, unknown>[];
    return {
      ok: true,
      backup: {
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date(0).toISOString(),
        tables,
      },
    };
  }

  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Career Intelligence 백업 파일이 아닙니다.' };
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, error: `지원하지 않는 백업 버전입니다. (파일: ${String(obj.version)}, 지원: ~${BACKUP_VERSION})` };
  }
  const rawTables = obj.tables;
  if (!rawTables || typeof rawTables !== 'object') {
    return { ok: false, error: '백업 파일에 tables 항목이 없습니다.' };
  }

  const tables = emptyTables();
  for (const name of BACKUP_TABLES) {
    const rows = (rawTables as Record<string, unknown>)[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return { ok: false, error: `${name} 테이블 형식이 올바르지 않습니다.` };
    for (const row of rows) {
      if (!row || typeof row !== 'object' || typeof (row as Record<string, unknown>).id !== 'string') {
        return { ok: false, error: `${name} 테이블에 id가 없는 레코드가 있습니다.` };
      }
    }
    tables[name] = rows as Record<string, unknown>[];
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: obj.version,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      tables,
    },
  };
}

function emptyTables(): BackupFile['tables'] {
  return {
    profiles: [],
    projects: [],
    jobDescriptions: [],
    applications: [],
    analysisResults: [],
    notionConfigs: [],
  };
}

export function summarizeBackup(backup: BackupFile, mode: RestoreMode): RestoreSummary {
  const counts = {} as Record<BackupTableName, number>;
  let total = 0;
  for (const name of BACKUP_TABLES) {
    counts[name] = backup.tables[name].length;
    total += counts[name];
  }
  return { mode, counts, total };
}

export function backupFileName(now: Date = new Date()): string {
  return `career-intel-backup-${now.toISOString().slice(0, 10)}.json`;
}

// ---------------------------------------------------------------
// IndexedDB 연동
// ---------------------------------------------------------------

export async function exportAllFromDb(): Promise<BackupFile> {
  const tables = emptyTables();
  for (const name of BACKUP_TABLES) {
    tables[name] = (await db.table(name).toArray()) as Record<string, unknown>[];
  }
  return buildBackup(tables);
}

/**
 * 백업 복원.
 * - replace: 기존 데이터를 모두 지우고 백업으로 대체
 * - merge: 같은 id는 백업 내용으로 덮어쓰고, 나머지는 보존
 * 단일 트랜잭션이므로 중간 실패 시 전체 롤백된다.
 */
export async function restoreToDb(backup: BackupFile, mode: RestoreMode): Promise<RestoreSummary> {
  const tables = BACKUP_TABLES.map((n) => db.table(n));
  await db.transaction('rw', tables, async () => {
    for (const name of BACKUP_TABLES) {
      const table = db.table(name);
      if (mode === 'replace') await table.clear();
      if (backup.tables[name].length > 0) await table.bulkPut(backup.tables[name]);
    }
  });
  return summarizeBackup(backup, mode);
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName();
  a.click();
  URL.revokeObjectURL(url);
}
