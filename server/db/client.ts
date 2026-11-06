import { Pool } from '@neondatabase/serverless';
import type { Db } from './types.js';

/**
 * 지연 초기화 DB 클라이언트(빌드 시 환경 변수가 없어도 죽지 않는다). Proxy 래퍼는 쓰지 않는다.
 * 런타임은 풀링 연결(DATABASE_URL), 마이그레이션은 직접 연결(DATABASE_URL_UNPOOLED)을 쓴다.
 */
let cached: { url: string; db: Db } | null = null;

export function getDb(env: Record<string, string | undefined>, kind: 'runtime' | 'migrate' = 'runtime'): Db | null {
  const url = kind === 'migrate' ? env.DATABASE_URL_UNPOOLED || env.DATABASE_URL : env.DATABASE_URL;
  if (!url) return null;
  if (!cached || cached.url !== url) cached = { url, db: new Pool({ connectionString: url, max: 3 }) as unknown as Db };
  return cached.db;
}
