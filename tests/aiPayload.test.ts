import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rulesFromProfile } from '../src/utils/piiRedaction';

vi.mock('../src/features/ai/piiGuard', async () => {
  const real = await vi.importActual<typeof import('../src/features/ai/piiGuard')>('../src/features/ai/piiGuard');
  return { ...real, loadRedactionRules: vi.fn() };
});

import { loadRedactionRules } from '../src/features/ai/piiGuard';
import { callLlmDetailed, buildMatchInsightPayload } from '../src/features/ai/aiClient';

const RULES = rulesFromProfile({ name: '김하나', email: 'hana@mail.com', phone: '010-9999-8888', redactTerms: ['서울대학교'] });
const ORIGINALS = ['김하나', 'hana@mail.com', '010-9999-8888', '01099998888', '서울대학교', 'hr@corp.com', '010-1111-2222'];

function stubBrowser(reply: (sent: { task: string; payload: unknown }) => unknown, status = 200) {
  const store = new Map<string, string>([['ci.ai.consent.v1', 'yes']]);
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(init.body);
      const body = JSON.parse(init.body);
      return { ok: status === 200, status, json: async () => reply(body) };
    }),
  );
  return { sent, store };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadRedactionRules).mockResolvedValue(RULES);
});

describe('AI 전송 관문 (callLlmDetailed)', () => {
  it('공고 구조화: 전송 본문에 연락처·이메일·가림 단어가 없고, 응답 토큰은 복원되어야 합니다', async () => {
    const { sent } = stubBrowser((b) => ({
      result: { company: 'A사', role: 'x', domain: '', responsibilities: [], qualifications: [`문의 ${(b.payload as { rawText: string }).rawText.match(/\{\{이메일[A-Z]+\}\}/)![0]}`], preferred: [] },
      model: 'm',
    }));
    const raw = '채용 담당 hr@corp.com / 010-1111-2222, 지원자 김하나(hana@mail.com, 서울대학교) 참고';
    const out = await callLlmDetailed<{ qualifications: string[] }>('parse-jd', { rawText: raw });
    for (const o of ORIGINALS) expect(sent[0]).not.toContain(o);
    expect(out.result.qualifications[0]).toBe('문의 hr@corp.com');
    expect(out.redactedCount).toBeGreaterThanOrEqual(5);
    expect(out.hadUserRules).toBe(true);
  });

  it('매칭 분석: 프로젝트 제목·성과 속 개인정보도 가려야 합니다', async () => {
    const { sent } = stubBrowser(() => ({ result: { summary: '', items: [] }, model: 'm' }));
    const payload = buildMatchInsightPayload(
      {
        id: 'j',
        sections: { qualifications: ['Python (문의 hr@corp.com)'], responsibilities: [], preferred: [] },
      } as never,
      [{ title: '김하나 포트폴리오', techStack: ['Python'], outcomes: ['서울대학교 연구실 공동, 010-9999-8888'] }] as never,
      null,
    );
    await callLlmDetailed('match-insight', payload);
    for (const o of ORIGINALS) expect(sent[0]).not.toContain(o);
  });

  it('다듬기: 모르는 토큰이 든 제안은 폐기하고, 정상 제안은 복원해야 합니다', async () => {
    stubBrowser(() => ({
      result: {
        suggestions: [
          { text: '{{이름A}} 가 성과를 냈다', note: '' },
          { text: '{{이름Z}} 가 성과를 냈다', note: '' },
        ],
      },
      model: 'm',
    }));
    const out = await callLlmDetailed<{ suggestions: { text: string }[] }>('polish', { text: '김하나 가 성과를 냈다' });
    expect(out.result.suggestions.map((s) => s.text)).toEqual(['김하나 가 성과를 냈다']);
  });

  it('다듬기: 모든 제안이 폐기되면 오류여야 합니다', async () => {
    stubBrowser(() => ({ result: { suggestions: [{ text: '{{이름Z}}', note: '' }] }, model: 'm' }));
    await expect(callLlmDetailed('polish', { text: '김하나 성과' })).rejects.toThrow('폐기');
  });

  it('동의가 없으면 전송 전에 차단되어야 합니다 (fetch 호출 없음)', async () => {
    const { store } = stubBrowser(() => ({}));
    store.delete('ci.ai.consent.v1');
    await expect(callLlmDetailed('polish', { text: '김하나 성과' })).rejects.toThrow('동의');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('규칙을 읽지 못하면 전송하지 않고, 오류 문구에 원본 값이 없어야 합니다', async () => {
    stubBrowser(() => ({}));
    vi.mocked(loadRedactionRules).mockRejectedValue(new Error('프로필의 가림 규칙을 읽지 못해 AI 전송을 중단했습니다.'));
    await expect(callLlmDetailed('polish', { text: '김하나 성과' })).rejects.toThrow('중단');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('연락처가 없어도 일반 패턴은 가리고, hadUserRules=false 로 알려야 합니다', async () => {
    vi.mocked(loadRedactionRules).mockResolvedValue(rulesFromProfile(null));
    const { sent } = stubBrowser(() => ({ result: { suggestions: [{ text: 'x', note: '' }] }, model: 'm' }));
    const out = await callLlmDetailed('polish', { text: '연락 010-1111-2222 로 문의' });
    expect(sent[0]).not.toContain('1111');
    expect(out.hadUserRules).toBe(false);
  });
});
