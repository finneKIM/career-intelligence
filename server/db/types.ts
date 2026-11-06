/**
 * 서버 DB 접근 최소 인터페이스. pg(Node)·@neondatabase/serverless Pool·시험용 PGlite 소켓이 모두 만족한다.
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number | null;
}
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface Db extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

/** 한 트랜잭션으로 실행. 예외가 나면 롤백한다. */
export async function withTx<T>(db: Db, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* 롤백 실패는 원래 오류를 가리지 않는다 */
    }
    throw e;
  } finally {
    client.release();
  }
}
