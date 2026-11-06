import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { guardRequest, json, RateLimiter, type ApiRequest, type ApiResponse, type HandlerDeps } from './http.js';

/**
 * 공고·기업 페이지 읽기 (6-B). 사용자가 입력한 URL 한 개를 읽어 본문 글자만 돌려준다.
 * 안전장치(AGENTS.md 9절 — 접근 제한 우회 금지):
 *  · robots.txt 를 먼저 확인해 허용되지 않으면 읽지 않는다(우회 없음). 로그인·봇 차단 페이지는 실패로 처리하고 붙여넣기를 안내한다.
 *  · 서버가 내부망을 읽지 않도록(SSRF) 사설·루프백·링크로컬 주소와 비표준 포트를 막고, 접속 시점에 주소를 다시 검사한다.
 *  · 리다이렉트는 최대 3번(매번 같은 검사), 응답은 1MB·8초 제한, HTML/텍스트만 허용. 읽은 내용은 저장하지 않는다.
 */
const UA = 'CareerIntelligenceBot/1.0 (+personal job-search tool; respects robots.txt)';
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
export const MAX_TEXT_CHARS = 12_000;

const limiter = new RateLimiter(10, 60_000);

// ---------------- 주소 검사 ----------------
export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a >= 224) return false; // 멀티캐스트·예약
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return false;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff')) return false;
    if (x.startsWith('2001:db8')) return false;
    return true;
  }
  return false;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

export function checkUrlShape(raw: unknown): UrlCheck {
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 2000) return { ok: false, reason: 'URL 형식이 올바르지 않습니다.' };
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'URL 형식이 올바르지 않습니다.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'http 또는 https 주소만 읽을 수 있습니다.' };
  if (u.username || u.password) return { ok: false, reason: '아이디·비밀번호가 포함된 주소는 읽지 않습니다.' };
  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, reason: '표준이 아닌 포트의 주소는 읽지 않습니다.' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && isIP(h.replace(/^\[|\]$/g, '')) === 0) {
    return { ok: false, reason: '내부 주소는 읽을 수 없습니다.' };
  }
  const bare = h.replace(/^\[|\]$/g, '');
  if (isIP(bare) && !isPublicIp(bare)) return { ok: false, reason: '내부 주소는 읽을 수 없습니다.' };
  return { ok: true, url: u };
}

// ---------------- 네트워크 (교체 가능) ----------------
export interface RawResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
  truncated: boolean;
}
export type GetFn = (url: URL, opts: { maxBytes: number; timeoutMs: number }) => Promise<RawResponse>;

export class BlockedAddressError extends Error {}

/** 실제 접속 구현: 접속 직전 DNS 결과를 검사(lookup 훅)해 내부 주소면 연결하지 않는다 */
export const defaultGet: GetFn = (url, { maxBytes, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.1', 'Accept-Language': 'ko,en;q=0.8' },
        timeout: timeoutMs,
        lookup: (host, options, cb) => {
          dnsLookup(host, { ...options, all: true }, (err, addrs) => {
            if (err) return (cb as (e: Error) => void)(err);
            const list = addrs as { address: string; family: number }[];
            if (list.length === 0 || !list.every((a) => isPublicIp(a.address))) return (cb as (e: Error) => void)(new BlockedAddressError('blocked'));
            if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: typeof list) => void)(null, list);
            (cb as unknown as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
          });
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        const done = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])),
            body: Buffer.concat(chunks),
            truncated,
          });
        res.on('end', done);
        res.on('close', done);
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });

// ---------------- robots.txt ----------------
export function robotsAllows(robotsTxt: string, path: string, agentToken = 'careerintelligencebot'): boolean {
  type Rule = { allow: boolean; pattern: string };
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      cur.rules.push({ allow: key === 'allow', pattern: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agentToken.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules).filter((r) => r.pattern !== '');
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    const esc = r.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp('^' + esc).test(path)) {
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  return best ? best.allow : true;
}

// ---------------- 본문 추출 ----------------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const metaDesc = decodeEntities(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? '');
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|br|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|table|dt|dd|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  const merged = metaDesc && !text.includes(metaDesc.slice(0, 40)) ? `${metaDesc}\n${text}` : text;
  return { title, text: merged };
}

function decodeBody(raw: RawResponse): string {
  const ct = raw.headers['content-type'] ?? '';
  let label = ct.match(/charset=([\w-]+)/i)?.[1];
  if (!label) {
    const head = raw.body.subarray(0, 4096).toString('latin1');
    label = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  }
  try {
    return new TextDecoder(label || 'utf-8').decode(raw.body);
  } catch {
    return new TextDecoder('utf-8').decode(raw.body);
  }
}

// ---------------- 핸들러 ----------------
export type ReadFailure = 'BAD_URL' | 'BLOCKED_ADDRESS' | 'ROBOTS_DISALLOWED' | 'ROBOTS_UNAVAILABLE' | 'HTTP_ERROR' | 'NOT_TEXT' | 'TOO_MANY_REDIRECTS' | 'EMPTY' | 'NETWORK';
const FAIL_MSG: Record<ReadFailure, string> = {
  BAD_URL: 'URL을 읽을 수 없는 형식입니다.',
  BLOCKED_ADDRESS: '내부 주소로 연결되는 URL은 읽지 않습니다.',
  ROBOTS_DISALLOWED: '이 사이트가 자동 수집을 허용하지 않아(robots.txt) 읽지 않았습니다.',
  ROBOTS_UNAVAILABLE: '이 사이트의 자동 수집 허용 여부(robots.txt)를 확인하지 못해 읽지 않았습니다.',
  HTTP_ERROR: '페이지가 오류를 돌려주었습니다(로그인이 필요하거나 접근이 제한된 페이지일 수 있습니다).',
  NOT_TEXT: '글자로 읽을 수 있는 페이지(HTML/텍스트)가 아닙니다.',
  TOO_MANY_REDIRECTS: '주소가 너무 여러 번 다른 곳으로 이동합니다.',
  EMPTY: '페이지에서 읽을 수 있는 내용이 거의 없습니다(스크립트로 그려지는 페이지이거나 로그인이 필요할 수 있습니다).',
  NETWORK: '페이지에 연결하지 못했습니다(시간 초과 또는 접속 거부).',
};
const GUIDE = ' 해당 페이지의 내용을 복사해 붙여 넣어 주세요.';

export interface ReadDeps extends HandlerDeps {
  get?: GetFn;
}

export type ReadOutcome =
  | { ok: true; text: string; title: string; finalUrl: string; truncated: boolean }
  | { ok: false; code: ReadFailure; reason: string };

const fail = (code: ReadFailure): ReadOutcome => ({ ok: false, code, reason: FAIL_MSG[code] + GUIDE });

export async function readUrl(raw: string, get: GetFn): Promise<ReadOutcome> {
  const first = checkUrlShape(raw);
  if (!first.ok) return fail(first.reason.includes('내부') ? 'BLOCKED_ADDRESS' : 'BAD_URL');
  let url = first.url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // robots.txt 확인(우회 없음)
      const robotsUrl = new URL('/robots.txt', url.origin);
      let robots: RawResponse;
      try {
        robots = await get(robotsUrl, { maxBytes: 200_000, timeoutMs: TIMEOUT_MS });
      } catch (e) {
        return fail(e instanceof BlockedAddressError ? 'BLOCKED_ADDRESS' : 'ROBOTS_UNAVAILABLE');
      }
      if (robots.status >= 500 || robots.status === 429) return fail('ROBOTS_UNAVAILABLE');
      if (robots.status >= 200 && robots.status < 300 && !robotsAllows(robots.body.toString('utf8'), url.pathname + url.search)) return fail('ROBOTS_DISALLOWED');

      const res = await get(url, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS });
      if (res.status >= 300 && res.status < 400 && res.headers['location']) {
        let next: URL;
        try {
          next = new URL(res.headers['location']!, url);
        } catch {
          return fail('BAD_URL');
        }
        const c = checkUrlShape(next.toString());
        if (!c.ok) return fail('BLOCKED_ADDRESS');
        url = c.url;
        if (hop === MAX_REDIRECTS) return fail('TOO_MANY_REDIRECTS');
        continue;
      }
      if (res.status < 200 || res.status >= 300) return fail('HTTP_ERROR');
      const ct = (res.headers['content-type'] ?? '').toLowerCase();
      if (!/text\/(html|plain)|application\/xhtml/.test(ct)) return fail('NOT_TEXT');
      const decoded = decodeBody(res);
      const { title, text } = /html/.test(ct) ? htmlToText(decoded) : { title: '', text: decoded.trim() };
      if (text.replace(/\s/g, '').length < 150) return fail('EMPTY');
      return { ok: true, text: text.slice(0, MAX_TEXT_CHARS), title, finalUrl: url.toString(), truncated: res.truncated || text.length > MAX_TEXT_CHARS };
    }
    return fail('TOO_MANY_REDIRECTS');
  } catch (e) {
    return fail(e instanceof BlockedAddressError || (e as { cause?: unknown })?.cause instanceof BlockedAddressError ? 'BLOCKED_ADDRESS' : 'NETWORK');
  }
}

export async function handleReadUrl(req: ApiRequest, deps: ReadDeps): Promise<ApiResponse> {
  const denied = guardRequest(req, deps.env, { requireAccessCode: false });
  if (denied) return denied;
  const now = (deps.now ?? Date.now)();
  if (!limiter.check(req.ip ?? 'unknown', now)) return json(429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { 'Retry-After': '60' });
  const body = req.body as { url?: unknown } | undefined;
  if (!body || typeof body.url !== 'string') return json(400, { error: 'url이 필요합니다.' });
  const out = await readUrl(body.url, deps.get ?? defaultGet);
  // 예상된 실패(막힘·로그인 필요 등)는 200 + ok:false 로 알려 화면이 붙여넣기를 안내하게 한다
  return json(200, out);
}
