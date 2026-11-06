import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleNodeRequest } from '../server/nodeAdapter.js';

// 계정·동기화 API 전체를 이 함수 1개가 처리한다(/api/account/* 는 vercel.json 의 rewrite 로 여기에 도달).
// Vercel 무료(Hobby) 플랜의 함수 12개 한도를 지키기 위해 파일을 늘리지 않는다.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleNodeRequest(req, res, '/api/account', process.env);
}
