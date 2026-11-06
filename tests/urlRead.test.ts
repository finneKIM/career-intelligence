import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  BlockedAddressError, checkUrlShape, defaultGet, handleReadUrl, htmlToText, isPublicIp, readUrl, robotsAllows,
  type GetFn, type RawResponse,
} from '../server/urlReadHandler';

const res = (status: number, body: string | Buffer, headers: Record<string, string> = {}): RawResponse => ({
  status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers }, body: Buffer.isBuffer(body) ? body : Buffer.from(body), truncated: false,
});
const LONG = '<html><head><title>채용 | A사</title></head><body><h1>ML 엔지니어</h1><p>' + '음성 모델을 만들고 서빙합니다. '.repeat(20) + '</p><script>alert(1)</script></body></html>';

/** URL별 응답표로 동작하는 가짜 네트워크 */
const fakeGet = (table: Record<string, RawResponse | Error>, calls: string[] = []): GetFn => async (url) => {
  calls.push(url.toString());
  const r = table[url.toString()];
  if (!r) return res(404, 'not found', { 'content-type': 'text/plain' });
  if (r instanceof Error) throw r;
  return r;
};

describe('주소 안전 검사 (SSRF 방지)', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])(
    '%s 는 내부 주소로 막아야 합니다', (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '52.1.2.3', '2607:f8b0:4005::1'])('%s 는 공개 주소여야 합니다', (ip) => expect(isPublicIp(ip)).toBe(true));

  it.each([
    'http://localhost/a', 'https://127.0.0.1/', 'http://[::1]/x', 'https://169.254.169.254/latest/meta-data', 'https://example.com:8080/', 'https://user:pw@example.com/',
    'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://intranet/', 'https://printer.local/', 'not a url', '',
  ])('위험하거나 잘못된 주소 "%s" 를 거부해야 합니다', (u) => expect(checkUrlShape(u).ok).toBe(false));

  it('정상 주소는 통과해야 합니다', () => {
    expect(checkUrlShape('https://www.example.com/jobs/1?x=1').ok).toBe(true);
    expect(checkUrlShape('http://example.co.kr/').ok).toBe(true);
  });

  it('실제 접속 구현은 이름이 내부 주소로 풀리면 연결하지 않아야 합니다', async () => {
    const srv = createServer((_q, r) => r.end('secret'));
    await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
    const port = (srv.address() as { port: number }).port;
    try {
      await expect(defaultGet(new URL(`http://localhost.:${port}/`), { maxBytes: 1000, timeoutMs: 3000 })).rejects.toThrow();
    } finally {
      srv.close();
    }
    expect(BlockedAddressError).toBeDefined();
  });
});

describe('robots.txt 규칙', () => {
  it('Disallow / Allow 를 가장 긴 규칙 우선으로 적용해야 합니다', () => {
    const txt = 'User-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.pdf$\n';
    expect(robotsAllows(txt, '/jobs/1')).toBe(true);
    expect(robotsAllows(txt, '/private/data')).toBe(false);
    expect(robotsAllows(txt, '/private/open/x')).toBe(true);
    expect(robotsAllows(txt, '/a/b.pdf')).toBe(false);
    expect(robotsAllows(txt, '/a/b.pdf?x=1')).toBe(true);
  });
  it('전체 금지와 우리 봇 전용 규칙을 구분해야 합니다', () => {
    expect(robotsAllows('User-agent: *\nDisallow: /\n', '/x')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: CareerIntelligenceBot\nAllow: /\n', '/x')).toBe(true);
    expect(robotsAllows('User-agent: CareerIntelligenceBot\nDisallow: /x\n', '/x')).toBe(false);
    expect(robotsAllows('', '/x')).toBe(true);
    expect(robotsAllows('Disallow: /x', '/x')).toBe(true); // 에이전트 없는 규칙은 무시
  });
});

describe('HTML 본문 추출', () => {
  it('스크립트·스타일을 제거하고 제목과 문단을 남기며 엔티티를 풀어야 합니다', () => {
    const { title, text } = htmlToText('<html><head><title>A &amp; B</title><style>.x{}</style></head><body><div>첫째 &lt;줄&gt;</div><script>bad()</script><p>둘째&nbsp;줄 &#51221;</p></body></html>');
    expect(title).toBe('A & B');
    expect(text).toContain('첫째 <줄>');
    expect(text).toContain('둘째 줄 정');
    expect(text).not.toContain('bad()');
    expect(text).not.toContain('.x{}');
  });
});

describe('페이지 읽기 흐름', () => {
  it('robots 가 허용하면 본문을 읽어 돌려줘야 합니다', async () => {
    const calls: string[] = [];
    const out = await readUrl('https://example.com/jobs/1', fakeGet({ 'https://example.com/robots.txt': res(200, 'User-agent: *\nAllow: /', { 'content-type': 'text/plain' }), 'https://example.com/jobs/1': res(200, LONG) }, calls));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.title).toBe('채용 | A사');
      expect(out.text).toContain('음성 모델을 만들고');
      expect(out.text).not.toContain('alert');
    }
    expect(calls[0]).toBe('https://example.com/robots.txt'); // 본문보다 robots 를 먼저 확인
  });

  it('robots 가 막으면 본문을 요청하지 않고 붙여넣기를 안내해야 합니다', async () => {
    const calls: string[] = [];
    const out = await readUrl('https://example.com/jobs/1', fakeGet({ 'https://example.com/robots.txt': res(200, 'User-agent: *\nDisallow: /jobs', { 'content-type': 'text/plain' }) }, calls));
    expect(out).toMatchObject({ ok: false, code: 'ROBOTS_DISALLOWED' });
    expect(!out.ok && out.reason).toContain('붙여 넣어');
    expect(calls).toEqual(['https://example.com/robots.txt']);
  });

  it('robots 를 확인할 수 없으면(서버 오류·접속 실패) 읽지 않고, 404 면 허용으로 봐야 합니다', async () => {
    expect(await readUrl('https://a.example.com/x', fakeGet({ 'https://a.example.com/robots.txt': res(503, '') }))).toMatchObject({ ok: false, code: 'ROBOTS_UNAVAILABLE' });
    expect(await readUrl('https://a.example.com/x', fakeGet({ 'https://a.example.com/robots.txt': new Error('down') }))).toMatchObject({ ok: false, code: 'ROBOTS_UNAVAILABLE' });
    expect(await readUrl('https://a.example.com/x', fakeGet({ 'https://a.example.com/x': res(200, LONG) }))).toMatchObject({ ok: true });
  });

  it('리다이렉트가 내부 주소로 향하면 따라가지 않고, 3번을 넘으면 중단해야 합니다', async () => {
    const toInternal = await readUrl('https://a.example.com/x', fakeGet({ 'https://a.example.com/x': res(302, '', { location: 'http://169.254.169.254/latest' }) }));
    expect(toInternal).toMatchObject({ ok: false, code: 'BLOCKED_ADDRESS' });
    const loop: Record<string, RawResponse> = {};
    for (let i = 0; i < 6; i++) loop[`https://a.example.com/${i}`] = res(302, '', { location: `/${i + 1}` });
    expect(await readUrl('https://a.example.com/0', fakeGet(loop))).toMatchObject({ ok: false, code: 'TOO_MANY_REDIRECTS' });
    const ok = await readUrl('https://a.example.com/a', fakeGet({ 'https://a.example.com/a': res(301, '', { location: 'https://b.example.com/b' }), 'https://b.example.com/b': res(200, LONG) }));
    expect(ok).toMatchObject({ ok: true, finalUrl: 'https://b.example.com/b' });
  });

  it('HTML 이 아니거나, 오류 응답이거나, 내용이 거의 없으면 실패로 안내해야 합니다', async () => {
    expect(await readUrl('https://a.example.com/p', fakeGet({ 'https://a.example.com/p': res(200, 'x', { 'content-type': 'application/pdf' }) }))).toMatchObject({ code: 'NOT_TEXT' });
    expect(await readUrl('https://a.example.com/p', fakeGet({ 'https://a.example.com/p': res(403, 'forbidden') }))).toMatchObject({ code: 'HTTP_ERROR' });
    expect(await readUrl('https://a.example.com/p', fakeGet({ 'https://a.example.com/p': res(200, '<html><body><div id=root></div></body></html>') }))).toMatchObject({ code: 'EMPTY' });
    expect(await readUrl('https://a.example.com/p', fakeGet({ 'https://a.example.com/p': new Error('reset') }))).toMatchObject({ code: 'NETWORK' });
  });

  it('EUC-KR 로 인코딩된 한국어 페이지(헤더 charset 또는 meta)를 올바르게 읽어야 합니다', async () => {
    // "한글" 의 EUC-KR 바이트: C7 D1 B1 DB
    const filler = 'engineer position description '.repeat(10);
    const head = Buffer.from('<html><head><meta charset="euc-kr"><title>t</title></head><body><p>' + filler);
    const body = Buffer.concat([head, Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]), Buffer.from('</p></body></html>')]);
    const viaMeta = await readUrl('https://kr.example.com/p', fakeGet({ 'https://kr.example.com/p': res(200, body, { 'content-type': 'text/html' }) }));
    expect(viaMeta.ok && viaMeta.text).toContain('한글');
    const viaHeader = await readUrl('https://kr2.example.com/p', fakeGet({ 'https://kr2.example.com/p': res(200, Buffer.concat([Buffer.from('<html><body><p>' + filler), Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]), Buffer.from('</p>')]), { 'content-type': 'text/html; charset=EUC-KR' }) }));
    expect(viaHeader.ok && viaHeader.text).toContain('한글');
  });
});

describe('API 핸들러', () => {
  const mk = (body: unknown, ip: string) => ({ method: 'POST', ip, bodyBytes: 100, headers: { host: 'a.test', origin: 'https://a.test' }, body });
  it('url 이 없으면 400, 내부 주소는 200 + 실패 안내(외부 접속 없음)여야 합니다', async () => {
    const calls: string[] = [];
    const deps = { env: {}, fetch: (async () => { throw new Error('x'); }) as never, get: fakeGet({}, calls) };
    expect((await handleReadUrl(mk({}, '5.5.5.1'), deps)).status).toBe(400);
    const r = await handleReadUrl(mk({ url: 'http://169.254.169.254/' }, '5.5.5.2'), deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, code: 'BLOCKED_ADDRESS' });
    expect(calls).toEqual([]);
  });
  it('분당 10회를 넘으면 429 여야 합니다', async () => {
    const deps = { env: {}, fetch: (async () => { throw new Error('x'); }) as never, get: fakeGet({}) };
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await handleReadUrl(mk({ url: 'https://a.example.com/' }, '5.5.5.3'), deps)).status);
    expect(codes).toContain(429);
  });
});
