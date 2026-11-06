import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import type { Db } from '../../server/db/types';
import { runMigrations } from '../../server/db/migrate';

export const migrationFiles = () => {
  const dir = join(process.cwd(), 'database', 'migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
};

/** 로컬 가짜 Postgres(PGlite)를 띄우고 마이그레이션을 적용한 DB 핸들. Neon 에는 접속하지 않는다. */
export async function startTestDb(migrate = true) {
  const port = 55000 + Math.floor(Math.random() * 4000);
  const lite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: lite, port, host: '127.0.0.1' });
  await server.start();
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 1 });
  const db = pool as unknown as Db;
  if (migrate) await runMigrations(db, migrationFiles());
  return {
    db,
    lite,
    close: async () => {
      await pool.end();
      await server.stop();
      await lite.close();
    },
  };
}
