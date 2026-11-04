import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest } from '../server/nodeAdapter.js';

// Vercel 서버리스 함수: 실제 로직은 server/ 코어에 있고 키는 서버 환경 변수에서만 읽습니다.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleNodeRequest(req, res, '/api/llm', process.env);
}
