import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiRequest, ApiResponse, FetchLike, HandlerDeps } from './http.js';
import { handleLlm } from './llmHandler.js';
import { handleNotion } from './notionHandler.js';
import { handleModels } from './modelsHandler.js';

/** Node 내장 fetch를 FetchLike 형태로 사용 */
export const nodeFetch: FetchLike = (url, init) => fetch(url, init) as ReturnType<FetchLike>;

async function readBody(req: IncomingMessage, limit = 100_000): Promise<{ text: string; bytes: number }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    bytes += buf.length;
    if (bytes > limit) return { text: '', bytes };
    chunks.push(buf);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Node IncomingMessage → ApiRequest */
export async function toApiRequest(req: IncomingMessage): Promise<ApiRequest> {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;

  let body: unknown;
  let bytes = 0;
  // Vercel Node 런타임은 본문을 미리 파싱해 req.body에 넣어 두고 스트림을 소모한다.
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (req.method === 'POST' && pre !== undefined) {
    body = typeof pre === 'string' ? safeParse(pre) : pre;
    bytes = Buffer.byteLength(typeof pre === 'string' ? pre : JSON.stringify(pre));
  } else if (req.method === 'POST') {
    const { text, bytes: b } = await readBody(req);
    bytes = b;
    if (text) body = safeParse(text);
  }
  const fwd = headers['x-forwarded-for']?.split(',')[0]?.trim();
  return { method: req.method ?? 'GET', headers, body, bodyBytes: bytes, ip: fwd || req.socket.remoteAddress };
}

export function sendApiResponse(res: ServerResponse, out: ApiResponse): void {
  res.statusCode = out.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  res.end(JSON.stringify(out.body));
}

export const ROUTES: Record<string, (req: ApiRequest, deps: HandlerDeps) => Promise<ApiResponse>> = {
  '/api/llm': handleLlm,
  '/api/notion': handleNotion,
  '/api/models': handleModels,
  '/api/health': async (_req, deps) => ({
    status: 200,
    body: {
      // 서버에 운영자 Gemini 키가 있는지(접근 코드로 보호됨). 키 값은 절대 노출하지 않는다.
      llm: !!deps.env.GEMINI_API_KEY,
      accessCodeRequired: !!deps.env.APP_ACCESS_CODE,
      // 방문자가 자기 Gemini 키를 입력해 쓰는 방식은 항상 가능
      byok: true,
    },
  }),
};

/** Vercel 함수와 Vite 개발 서버가 공유하는 Node 요청 처리기 */
export async function handleNodeRequest(req: IncomingMessage, res: ServerResponse, route: string, env: HandlerDeps['env']) {
  const handler = ROUTES[route];
  if (!handler) {
    sendApiResponse(res, { status: 404, body: { error: 'Not found' } });
    return;
  }
  try {
    const apiReq = await toApiRequest(req);
    const out = await handler(apiReq, { env, fetch: nodeFetch });
    sendApiResponse(res, out);
  } catch {
    // 내부 오류 메시지에는 키/토큰이 섞일 수 있으므로 상세 내용을 응답·로그에 남기지 않는다.
    sendApiResponse(res, { status: 500, body: { error: '서버 내부 오류가 발생했습니다.' } });
  }
}
