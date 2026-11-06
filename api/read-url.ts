import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest } from '../server/nodeAdapter.js';

// 공고·기업 페이지 읽기(6-B). robots.txt 확인·내부망 차단 후 본문 글자만 돌려준다.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleNodeRequest(req, res, '/api/read-url', process.env);
}
