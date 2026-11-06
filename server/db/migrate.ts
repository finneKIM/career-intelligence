import { createHash } from 'node:crypto';
import type { Db } from './types.js';

export interface MigrationFile {
  name: string;
  sql: string;
}
export const checksum = (sql: string): string => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

const LOCK_KEY = 727274;

/**
 * 번호 순서로 마이그레이션을 적용한다. 파일 하나 = 트랜잭션 하나.
 * 이미 적용된 파일은 건너뛰고, 내용(체크섬)이 바뀌었으면 거부한다. 동시 실행은 advisory lock으로 막는다.
 */
export async function runMigrations(db: Db, files: MigrationFile[]): Promise<{ applied: string[]; skipped: string[] }> {
  const lock = await db.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await lock.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Map(
      (await lock.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]),
    );
    for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
      const sum = checksum(f.sql);
      const prev = done.get(f.name);
      if (prev !== undefined) {
        if (prev !== sum) throw new Error(`마이그레이션 ${f.name} 내용이 적용 당시와 다릅니다(체크섬 불일치). 새 번호의 수정 마이그레이션을 만드세요.`);
        skipped.push(f.name);
        continue;
      }
      // 같은 연결에서 트랜잭션을 연다(잠금을 쥔 연결 하나만 사용)
      try {
        await lock.query('BEGIN');
        await lock.query(f.sql);
        await lock.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [f.name, sum]);
        await lock.query('COMMIT');
      } catch (e) {
        await lock.query('ROLLBACK').catch(() => undefined);
        throw e;
      }
      applied.push(f.name);
    }
  } finally {
    try {
      await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      lock.release();
    }
  }
  return { applied, skipped };
}
