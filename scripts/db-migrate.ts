/**
 * 마이그레이션 실행기 (사람이 직접 실행). 기본은 "미리보기"이며 --apply 를 줘야 실제로 적용한다.
 *   vercel env run -- npx vite-node scripts/db-migrate.ts            (미리보기: 대기 중 목록과 DB 상태만 출력)
 *   vercel env run -- npx vite-node scripts/db-migrate.ts --apply    (적용)
 * 연결 문자열은 환경 변수로만 받고 출력하지 않는다(호스트 이름 앞부분만 표시).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../server/db/client';
import { runMigrations, checksum } from '../server/db/migrate';

const apply = process.argv.includes('--apply');
const db = getDb(process.env, 'migrate');
if (!db) {
  console.log('DATABASE_URL(_UNPOOLED) 이 없습니다. `vercel env run -- ...` 으로 실행하세요.');
  process.exit(2);
}
const dir = join(process.cwd(), 'database', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));

const host = new URL((process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!).host.split('.')[0];
console.log(`대상 DB 호스트: ${host}…`);

const tables = await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1");
console.log('현재 public 테이블:', tables.rows.map((r) => r.tablename).join(', ') || '(없음)');
let done: string[] = [];
if (tables.rows.some((r) => r.tablename === 'schema_migrations')) {
  done = (await db.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations ORDER BY 1')).rows.map(
    (r) => `${r.name}${files.find((f) => f.name === r.name && checksum(f.sql) !== r.checksum) ? ' (내용 변경됨!)' : ''}`,
  );
}
console.log('적용됨:', done.join(', ') || '(없음)');
console.log('대기:', files.filter((f) => !done.some((d) => d.startsWith(f.name))).map((f) => f.name).join(', ') || '(없음)');

if (!apply) {
  console.log('미리보기만 했습니다. 적용하려면 --apply 를 붙이세요.');
  process.exit(0);
}
const r = await runMigrations(db, files);
console.log('적용:', r.applied.join(', ') || '(없음)', '/ 건너뜀:', r.skipped.join(', ') || '(없음)');
const after = await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1");
console.log('적용 후 테이블:', after.rows.map((x) => x.tablename).join(', '));
process.exit(0);
