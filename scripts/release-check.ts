/**
 * 배포 직전 점검 (읽기 전용). 실제 배포·환경 변수 변경은 하지 않는다.
 *   vercel env run -- npx vite-node scripts/release-check.ts
 * 확인: ① 함수 개수(무료 12개 한도) ② 공용 DB에 마이그레이션이 모두 적용되고 변조되지 않았는지 ③ 공용 DB에 사용자 데이터가 0건인지(G1)
 *      ④ 빌드 결과물에 비밀 값 형태가 없는지 ⑤ vercel.json 보안 헤더·rewrite
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from '../server/db/client';
import { checksum } from '../server/db/migrate';

let failed = 0;
const check = (ok: boolean, name: string, extra = '') => {
  if (!ok) failed++;
  console.log(ok ? 'PASS' : 'FAIL', name, extra);
};

const fns = readdirSync('api').filter((f) => f.endsWith('.ts'));
check(fns.length <= 12, `Vercel 함수 개수 ${fns.length}/12`, `(${fns.join(', ')})`);

const vj = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: { source: string }[]; headers?: { headers: { key: string }[] }[] };
check(!!vj.rewrites?.some((r) => r.source.startsWith('/api/account')), '/api/account/* rewrite 설정');
const keys = new Set(vj.headers?.flatMap((h) => h.headers.map((x) => x.key)));
check(['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options'].every((k) => keys.has(k)), '보안 헤더 4종');

if (existsSync('dist/assets')) {
  const bad: string[] = [];
  for (const f of readdirSync('dist/assets').filter((x) => x.endsWith('.js'))) {
    const t = readFileSync(join('dist/assets', f), 'utf8');
    if (/postgres(ql)?:\/\/[^\s"']+@/i.test(t) || /AIza[0-9A-Za-z_-]{30}/.test(t) || /BETTER_AUTH_SECRET\s*[:=]\s*["'][^"']{16,}/.test(t)) bad.push(f);
  }
  check(bad.length === 0, '빌드 결과물에 DB 주소·키 형태 없음', bad.join(','));
} else check(false, 'dist 없음 — npm run build 먼저');

const db = getDb(process.env, 'migrate');
if (!db) check(false, 'DATABASE_URL 없음(vercel env run 으로 실행)');
else {
  const files = readdirSync('database/migrations').filter((f) => f.endsWith('.sql')).sort();
  const applied = (await db.query<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations ORDER BY 1')).rows;
  check(applied.length === files.length && files.every((f, i) => applied[i]?.name === f), `마이그레이션 ${applied.length}/${files.length}개 적용`);
  check(
    files.every((f, i) => applied[i]?.checksum === checksum(readFileSync(join('database/migrations', f), 'utf8'))),
    '적용된 파일과 현재 파일 체크섬 일치',
  );
  const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0].n);
  const users = (await n('SELECT count(*) AS n FROM users')) + (await n('SELECT count(*) AS n FROM "user"')) + (await n('SELECT count(*) AS n FROM session')) + (await n('SELECT count(*) AS n FROM account'));
  check(users === 0, `공용 DB 사용자·세션·계정 행 ${users}건 (공개 전 0이어야 함 — G1)`);
  const data = await n(
    'SELECT (SELECT count(*) FROM projects)+(SELECT count(*) FROM profiles)+(SELECT count(*) FROM job_postings)+(SELECT count(*) FROM applications)+(SELECT count(*) FROM analysis_results)+(SELECT count(*) FROM source_documents)+(SELECT count(*) FROM company_materials)+(SELECT count(*) FROM generated_documents)+(SELECT count(*) FROM consents)+(SELECT count(*) FROM user_keys) AS n',
  );
  check(data === 0, `공용 DB 데이터 행 ${data}건`);
}
console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
