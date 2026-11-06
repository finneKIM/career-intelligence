import { describe, expect, it, vi } from 'vitest';
import { handleLlm } from '../server/llmHandler';
import { buildPrompt, validateCompanySummary, validateGenerated } from '../server/prompts';
import type { ApiRequest, FetchLike } from '../server/http';

const EVIDENCE = [
  { id: 'e1', type: 'outcome', label: '음성 모델', text: '추론 지연을 180ms에서 90ms로 줄임' },
  { id: 'e2', type: 'skill', label: '기술', text: 'PyTorch, Docker' },
];

describe('기업 요약 프롬프트·검증', () => {
  it('자료가 너무 짧으면 거부하고, 자료만 근거로 쓰라는 규칙이 들어가야 합니다', () => {
    expect(buildPrompt('company-summary', { materials: [{ title: 'a', content: '짧음' }] })).toHaveProperty('error');
    const p = buildPrompt('company-summary', { materials: [{ title: '소개', content: '우리는 음향 AI 서비스를 만드는 회사입니다. 오디오 기술에 집중합니다.' }] });
    expect(p).toHaveProperty('user');
    expect((p as { user: string }).user).toContain('자료에 없는 사실은 절대 쓰지 마세요');
  });

  it('응답은 길이를 제한하고 형식이 틀리면 버려야 합니다', () => {
    expect(validateCompanySummary({ overview: '개요', keyPoints: ['a', 1, 'b'], talentTraits: [] })).toEqual({ overview: '개요', keyPoints: ['a', 'b'], talentTraits: [] });
    expect(validateCompanySummary('x')).toBeNull();
    expect(validateCompanySummary({ overview: '', keyPoints: [] })).toBeNull();
  });
});

describe('생성 문서 프롬프트·검증 (날조 차단)', () => {
  it('근거가 없으면 프롬프트 생성을 거부해야 합니다', () => {
    expect(buildPrompt('generate-resume', { job: { company: 'A' }, evidence: [] })).toHaveProperty('error');
  });

  it('프롬프트에 근거 ID와 근거 필수 규칙이 들어가야 합니다', () => {
    const p = buildPrompt('generate-cover-letter', { job: { company: 'A사', role: 'ML', requirements: ['PyTorch'] }, evidence: EVIDENCE }) as { user: string };
    expect(p.user).toContain('[e1]');
    expect(p.user).toContain('evidenceIds');
    expect(p.user).toContain('만들지 마세요');
  });

  it('알 수 없는 근거 ID는 제거하고, 유효한 근거가 없는 문단은 버려야 합니다', () => {
    const r = validateGenerated(
      { sections: [{ heading: '경험', paragraphs: [{ text: '지연 시간을 줄였습니다', evidenceIds: ['e1', 'zzz'] }, { text: '근거 없는 주장', evidenceIds: ['nope'] }, { text: '근거 배열 없음' }] }] },
      EVIDENCE,
    ) as { sections: { paragraphs: { evidenceIds: string[] }[] }[]; dropped: number };
    expect(r.sections[0].paragraphs).toHaveLength(1);
    expect(r.sections[0].paragraphs[0].evidenceIds).toEqual(['e1']);
    expect(r.dropped).toBe(2);
  });

  it('인용한 근거에 없는 새 숫자가 든 문단은 버려야 합니다', () => {
    const r = validateGenerated(
      { sections: [{ heading: '성과', paragraphs: [
        { text: '지연을 180ms에서 90ms로 줄였습니다', evidenceIds: ['e1'] },
        { text: '지연을 70% 줄였습니다', evidenceIds: ['e1'] },
        { text: 'PyTorch와 Docker 사용', evidenceIds: ['e2'] },
      ] }] },
      EVIDENCE,
    ) as { sections: { paragraphs: { text: string }[] }[]; dropped: number };
    expect(r.sections[0].paragraphs.map((p) => p.text)).toEqual(['지연을 180ms에서 90ms로 줄였습니다', 'PyTorch와 Docker 사용']);
    expect(r.dropped).toBe(1);
  });

  it('모든 문단이 버려지면 응답 전체를 거부해야 합니다', () => {
    expect(validateGenerated({ sections: [{ heading: 'x', paragraphs: [{ text: '숫자 999', evidenceIds: ['e2'] }] }] }, EVIDENCE)).toBeNull();
    expect(validateGenerated({ sections: 'x' }, EVIDENCE)).toBeNull();
  });

  it('핸들러: 모델 응답의 근거 검증이 적용되고, 개인정보 안전망도 그대로 동작해야 합니다', async () => {
    const reply = { candidates: [{ content: { parts: [{ text: JSON.stringify({ sections: [{ heading: '요약', paragraphs: [{ text: '지연을 90ms로 줄임', evidenceIds: ['e1'] }, { text: '매출 300% 성장', evidenceIds: ['e1'] }] }] }) }] } }] };
    const fetch: FetchLike = vi.fn(async () => ({ ok: true, status: 200, json: async () => reply, text: async () => '' }));
    const mk = (payload: unknown, ip: string): ApiRequest => ({
      method: 'POST', ip, bodyBytes: 500, headers: { host: 'a.test', origin: 'https://a.test', 'x-gemini-key': 'AIza' + 'k'.repeat(30) },
      body: { task: 'generate-resume', payload },
    });
    const ok = await handleLlm(mk({ job: { company: 'A', role: 'B', requirements: ['x'] }, evidence: EVIDENCE }, '8.8.1.1'), { env: { GEMINI_MODEL: 'm' }, fetch });
    expect(ok.status).toBe(200);
    const res = (ok.body as { result: { sections: { paragraphs: unknown[] }[]; dropped: number } }).result;
    expect(res.sections[0].paragraphs).toHaveLength(1);
    expect(res.dropped).toBe(1);
    const leak = await handleLlm(mk({ job: { company: 'A' }, evidence: [{ id: 'e1', type: 'x', label: 'l', text: '연락 010-1234-5678' }] }, '8.8.1.2'), { env: { GEMINI_MODEL: 'm' }, fetch });
    expect(leak.status).toBe(400);
  });
});
