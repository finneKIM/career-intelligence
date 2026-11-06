// Better Auth 테이블 SQL을 database/migrations/0003_auth_tables.sql 로 생성한다(한 번 실행, 결과는 SQL 파일로 관리).
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { writeFileSync } from 'node:fs';

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 54331, host: '127.0.0.1' });
await server.start();
const pool = new pg.Pool({ host: '127.0.0.1', port: 54331, user: 'postgres', database: 'postgres', max: 1 });
const auth = betterAuth({
  database: pool,
  secret: 'x'.repeat(32),
  baseURL: 'http://localhost:3000',
  basePath: '/api/account/auth',
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: true, storage: 'database' },
  user: { deleteUser: { enabled: true } },
});
const { compileMigrations } = await getMigrations(auth.options);
const sql = await compileMigrations();
writeFileSync(
  'database/migrations/0003_auth_tables.sql',
  `-- 0003 — 로그인 서비스(Better Auth) 테이블. scripts/gen-auth-migration.mjs 로 생성한 SQL(better-auth 설정 기준).\n-- 비밀번호는 해시로만 저장되며, 이 서비스에 보내지는 "비밀번호"는 브라우저가 파생한 로그인용 값이다.\n\n${sql}\n`,
);
await pool.end(); await server.stop(); await db.close();
console.log(sql);
