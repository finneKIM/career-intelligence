import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest } from '../server/nodeAdapter.js';

// Vercel 서버리스 함수: 키로 조회한 사용 가능 모델 목록 (사용자 데이터 전송 없음)
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleNodeRequest(req, res, '/api/models', process.env);
}
