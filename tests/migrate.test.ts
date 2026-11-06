import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, migrationFiles } from './helpers/testDb';
import { runMigrations } from '../server/db/migrate';
import type { Db } from '../server/db/types';

let h: Awaited<ReturnType<typeof startTestDb>>;
let db: Db;
let lite: Awaited<ReturnType<typeof startTestDb>>['lite'];
beforeAll(async () => {
  h = await startTestDb(false);
  db = h.db;
  lite = h.lite;
});
afterAll(() => h.close());

describe('마이그레이션 실행기', () => {
  it('처음에는 모두 적용하고, 다시 실행하면 아무 일도 하지 않아야 합니다', async () => {
    const files = migrationFiles();
    const first = await runMigrations(db, files);
    expect(first.applied).toEqual(files.map((f) => f.name));
    const again = await runMigrations(db, files);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toHaveLength(files.length);
  });

  it('적용된 파일의 내용이 바뀌면 거부해야 합니다(체크섬)', async () => {
    const files = migrationFiles().map((f, i) => (i === 0 ? { ...f, sql: f.sql + '\n-- 변조' } : f));
    await expect(runMigrations(db, files)).rejects.toThrow('체크섬');
  });

  it('중간에 실패하면 그 파일은 통째로 되돌려지고 기록되지 않아야 합니다', async () => {
    const broken = { name: '9999_broken.sql', sql: 'CREATE TABLE tmp_ok (a int); SELECT 1/0;' };
    await expect(runMigrations(db, [...migrationFiles(), broken])).rejects.toThrow();
    const t = await db.query("SELECT to_regclass('tmp_ok') AS t");
    expect((t.rows[0] as { t: string | null }).t).toBeNull();
    const rec = await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='9999_broken.sql'");
    expect((rec.rows[0] as { n: number }).n).toBe(0);
  });

  it('핵심 제약이 살아 있어야 합니다(약한 KDF 거부, 추가 전용 테이블 수정 거부, 연쇄 삭제)', async () => {
    const id = '33333333-3333-4333-8333-333333333333';
    await lite.query('INSERT INTO users (id, auth_subject) VALUES ($1, $2)', [id, 'a-1']);
    await expect(
      lite.query(
        `INSERT INTO user_keys (user_id,kdf_algorithm,kdf_iterations,kdf_salt,wrapped_dek,wrapped_dek_nonce,recovery_wrapped_dek,recovery_nonce,recovery_verifier)
         VALUES ($1,'PBKDF2-SHA256',1000,$2,$3,$4,$3,$4,$5)`,
        [id, Buffer.alloc(16), Buffer.alloc(48), Buffer.alloc(12), Buffer.alloc(32)],
      ),
    ).rejects.toThrow();
    await lite.query(
      `INSERT INTO analysis_results (user_id,id,payload_enc,payload_nonce) VALUES ($1,'a1',$2,$3)`,
      [id, Buffer.alloc(40, 1), Buffer.alloc(12, 2)],
    );
    await expect(lite.query(`UPDATE analysis_results SET payload_enc=$2 WHERE user_id=$1`, [id, Buffer.alloc(40, 9)])).rejects.toThrow('append-only');
    await lite.query(`UPDATE analysis_results SET deleted_at=now() WHERE user_id=$1`, [id]); // 삭제 표시는 허용
    await lite.query('DELETE FROM users WHERE id=$1', [id]);
    expect(Number((await lite.query<{ n: number }>('SELECT count(*)::int AS n FROM analysis_results')).rows[0].n)).toBe(0);
  });
});
