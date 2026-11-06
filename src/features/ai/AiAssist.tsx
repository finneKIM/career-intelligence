import { useState } from 'react';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { db } from '../../db';
import type { JobDescription } from '../../types';
import {
  ApiError,
  buildMatchInsightPayload,
  callLlmDetailed,
  type LlmOutcome,
  type MatchInsightResult,
  type ParsedJdResult,
  type PolishResult,
} from './aiClient';

interface Meta {
  model: string;
  attempts: string[];
  redactedCount: number;
  hadUserRules: boolean;
}

function useAiCall<T>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const run = async (fn: () => Promise<LlmOutcome<T>>): Promise<T | null> => {
    setLoading(true);
    setError('');
    try {
      const out = await fn();
      setData(out.result);
      setMeta({ model: out.model, attempts: out.attempts, redactedCount: out.redactedCount, hadUserRules: out.hadUserRules });
      return out.result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'AI 호출 중 알 수 없는 오류가 발생했습니다.');
      return null;
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, data, meta, run, reset: () => setData(null) };
}

/** 사용된 모델과(있다면) 먼저 실패해 건너뛴 모델을 작게 보여 준다 */
function ModelNote({ meta }: { meta: Meta | null }) {
  if (!meta) return null;
  return (
    <div className="space-y-0.5">
      {meta.model && (
        <p className="text-[10px] text-slate-400">
          사용 모델: {meta.model}
          {meta.attempts.length > 0 && ` · 건너뛴 모델: ${meta.attempts.join(', ')}`}
        </p>
      )}
      <p className="text-[10px] text-slate-400">개인정보 {meta.redactedCount}건 가림 후 전송</p>
      {!meta.hadUserRules && (
        <p className="text-[10px] text-amber-600">
          프로필에 연락처·가림 단어를 등록하면 이름도 가려서 보낼 수 있습니다 (프로필 기본정보 수정).
        </p>
      )}
    </div>
  );
}

const btn =
  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer disabled:opacity-50';

// ---------------------------------------------------------------
// 1) 공고 구조화 보강
// ---------------------------------------------------------------

export function AiJdParseButton({ rawText, onResult }: { rawText: string; onResult: (r: ParsedJdResult) => void }) {
  const { loading, error, meta, run } = useAiCall<ParsedJdResult>();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={loading || rawText.trim().length < 30}
        onClick={async () => {
          const r = await run(() => callLlmDetailed<ParsedJdResult>('parse-jd', { rawText }));
          if (r) onResult(r);
        }}
        className={`${btn} bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100`}
        title="정규식 파서가 놓친 섹션을 AI가 보완합니다 (설정 탭에서 동의 필요)"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        AI로 구조화 보강
      </button>
      {error && <p className="text-[11px] text-rose-600">{error}</p>}
      <ModelNote meta={meta} />
    </div>
  );
}

// ---------------------------------------------------------------
// 2) 매칭 분석 보강
// ---------------------------------------------------------------

const ASSESS_STYLE = {
  strong: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-sky-50 text-sky-700 border-sky-200',
  weak: 'bg-amber-50 text-amber-700 border-amber-200',
} as const;
const ASSESS_LABEL = { strong: '충분', partial: '부분', weak: '부족' } as const;

export function AiMatchInsight({ jd }: { jd: JobDescription }) {
  const { loading, error, data, meta, run } = useAiCall<MatchInsightResult>();

  return (
    <div className="bg-violet-50/50 rounded-2xl p-5 border border-violet-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-violet-900 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> AI 심층 분석 <span className="text-[10px] font-normal text-violet-500">(참고용 · 저장되지 않음)</span>
        </h3>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            run(async () => {
              const [projects, profile] = await Promise.all([db.projects.toArray(), db.profiles.get('current-user')]);
              return callLlmDetailed<MatchInsightResult>('match-insight', buildMatchInsightPayload(jd, projects, profile ?? null));
            })
          }
          className={`${btn} bg-white text-violet-700 border-violet-200 hover:bg-violet-100`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {data ? '다시 분석' : 'AI 분석 실행'}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        키워드 매칭에 더해 의미 기반으로 요구사항별 근거 충족도를 평가합니다. 합격 가능성을 예측하지 않으며, 위의 객관적 충족도 점수는 바뀌지 않습니다.
      </p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {data && <ModelNote meta={meta} />}
      {data && (
        <div className="space-y-2">
          {data.summary && <p className="text-xs text-slate-700 leading-relaxed">{data.summary}</p>}
          {data.items.map((it) => (
            <div key={it.requirement} className="bg-white rounded-xl border border-slate-200 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ASSESS_STYLE[it.assessment]}`}>
                  {ASSESS_LABEL[it.assessment]}
                </span>
                <p className="text-xs font-semibold text-slate-800">{it.requirement}</p>
              </div>
              {it.reason && <p className="text-[11px] text-slate-600">근거: {it.reason}</p>}
              {it.improvement && <p className="text-[11px] text-violet-700">보완: {it.improvement}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// 3) 성과 문장 다듬기
// ---------------------------------------------------------------

export function AiPolishButton({ text, onPick }: { text: string; onPick: (t: string) => void }) {
  const { loading, error, data, meta, run, reset } = useAiCall<PolishResult>();
  return (
    <div className="relative">
      <button
        type="button"
        disabled={loading || text.trim().length < 5}
        onClick={() => run(() => callLlmDetailed<PolishResult>('polish', { text }))}
        className="p-2 text-violet-500 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors shrink-0 disabled:opacity-40"
        title="AI로 문장 다듬기 (원문에 없는 수치는 추가되지 않습니다)"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
      </button>
      {error && <p className="absolute right-0 top-full z-20 w-64 mt-1 p-2 bg-white border border-rose-200 rounded-lg text-[11px] text-rose-600">{error}</p>}
      {data && (
        <div className="absolute right-0 z-20 mt-1 w-80 bg-white border border-violet-200 rounded-xl shadow-lg p-2 space-y-1">
          {data.suggestions.map((s) => (
            <button
              key={s.text}
              type="button"
              onClick={() => {
                onPick(s.text);
                reset();
              }}
              className="w-full text-left p-2 rounded-lg hover:bg-violet-50 text-xs"
            >
              <span className="block text-slate-800">{s.text}</span>
              {s.note && <span className="block text-[10px] text-slate-400 mt-0.5">{s.note}</span>}
            </button>
          ))}
          <ModelNote meta={meta} />
          <button type="button" onClick={reset} className="w-full text-center text-[11px] text-slate-400 hover:text-slate-600">
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
