import { describe, expect, it, vi } from 'vitest';
import { handleLlm } from '../server/llmHandler';
import { buildPrompt, validateKeywords, validateSearch } from '../server/prompts';
import type { ApiRequest, FetchLike } from '../server/http';

const KEY = 'AIza' + 'q'.repeat(30);
const mk = (task: string, payload: unknown, ip: string, extra: Record<string, string> = {}): ApiRequest => ({
  method: 'POST', ip, bodyBytes: 400, body: { task, payload },
  headers: { host: 'a.test', origin: 'https://a.test', 'x-gemini-key': KEY, ...extra },
});
const reply = (text: string, chunks?: unknown[]) => ({ candidates: [{ content: { parts: [{ text }] }, ...(chunks ? { groundingMetadata: { groundingChunks: chunks } } : {}) }] });
const fetchOf = (payload: unknown): FetchLike => vi.fn(async () => ({ ok: true, status: 200, json: async () => payload, text: async () => '' }));
const ENV = { GEMINI_MODEL: 'm' };

describe('Google 검색 연동 (유료 키 선언 필요, 모킹)', () => {
  it('유료 선언 헤더가 없으면 403 이고 Gemini 를 호출하지 않아야 합니다', async () => {
    const fetch = fetchOf(reply('x'));
    const r = await handleLlm(mk('company-search', { company: '샘플기업' }, '6.6.1.1'), { env: ENV, fetch });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain('붙여넣어');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('유료 선언 시 검색 도구를 켜고(JSON 형식 지정 없이) 요청하며, 출처와 함께 결과를 돌려줘야 합니다', async () => {
    const fetch = fetchOf(reply('① 사업: 음향 AI', [{ web: { uri: 'https://news.example.com/a', title: '기사' } }, { web: { uri: 'http://insecure.example.com', title: 'x' } }, { web: { uri: 'https://news.example.com/a', title: '중복' } }]));
    const r = await handleLlm(mk('company-search', { company: '샘플기업', role: 'ML' }, '6.6.1.2', { 'x-gemini-tier': 'PAID' }), { env: ENV, fetch });
    expect(r.status).toBe(200);
    const result = (r.body as { result: { summary: string; sources: { url: string }[] } }).result;
    expect(result.summary).toContain('음향 AI');
    expect(result.sources).toEqual([{ url: 'https://news.example.com/a', title: '기사' }]);
    const sent = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body);
    expect(sent.tools).toEqual([{ google_search: {} }]);
    expect(sent.generationConfig.responseMimeType).toBeUndefined();
  });

  it('검색 출처가 하나도 없는 응답은 근거 없는 서술일 수 있어 거부해야 합니다', async () => {
    const r = await handleLlm(mk('company-search', { company: '샘플기업' }, '6.6.1.3', { 'x-gemini-tier': 'PAID' }), { env: ENV, fetch: fetchOf(reply('그럴듯한 서술')) });
    expect(r.status).toBe(502);
  });

  it('기업 이름이 없으면 프롬프트를 만들지 않고, 일반 작업에는 검색 도구를 붙이지 않아야 합니다', async () => {
    expect(buildPrompt('company-search', { company: '' })).toHaveProperty('error');
    const fetch = fetchOf(reply(JSON.stringify({ keywords: [{ term: 'PyTorch', reason: 'r' }] })));
    await handleLlm(mk('extract-keywords', { jdText: 'PyTorch 경험이 있는 ML 엔지니어를 채용합니다. 서빙 경험 우대.' }, '6.6.1.4'), { env: ENV, fetch });
    const sent = JSON.parse((fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body);
    expect(sent.tools).toBeUndefined();
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
  });

  it('validateSearch: 출처 8개 제한, 빈 응답 거부', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ web: { uri: `https://e.com/${i}`, title: 't' } }));
    expect((validateSearch('내용', many) as { sources: unknown[] }).sources).toHaveLength(8);
    expect(validateSearch('', many)).toBeNull();
    expect(validateSearch('내용', [])).toBeNull();
  });
});

describe('AI 키워드 검증 (원문에 없는 단어 차단)', () => {
  const SRC = 'PyTorch 기반 음성 모델을 Docker 로 서빙합니다. MLOps 경험 우대';
  it('원문에 등장하는 표현만 남기고 중복·짧은 값을 제거해야 합니다', () => {
    const r = validateKeywords({ keywords: [
      { term: 'pytorch', reason: '핵심' }, { term: 'PyTorch', reason: '중복' }, { term: 'Kubernetes', reason: '원문에 없음' },
      { term: 'x', reason: '짧음' }, { term: 'MLOps', reason: '우대' }, { term: '음성 모델', reason: '도메인' },
    ] }, SRC) as { keywords: { term: string }[] };
    expect(r.keywords.map((k) => k.term)).toEqual(['pytorch', 'MLOps', '음성 모델']);
  });
  it('남는 키워드가 없거나 형식이 틀리면 거부해야 합니다', () => {
    expect(validateKeywords({ keywords: [{ term: 'Kubernetes', reason: '' }] }, SRC)).toBeNull();
    expect(validateKeywords('x', SRC)).toBeNull();
    expect(validateKeywords({ keywords: 'x' }, SRC)).toBeNull();
  });
  it('공고 본문이 너무 짧으면 프롬프트를 만들지 않아야 합니다', () => {
    expect(buildPrompt('extract-keywords', { jdText: '짧다' })).toHaveProperty('error');
  });
});
