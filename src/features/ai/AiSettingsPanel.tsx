import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  ApiError,
  fetchHealth,
  fetchModels,
  getAccessCode,
  getGeminiKey,
  getGeminiModel,
  hasAiConsent,
  isPersisted,
  setAccessCode,
  setAiConsent,
  setGeminiKey,
  setGeminiModel,
  type Health,
} from './aiClient';

export function AiSettingsPanel() {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [consent, setConsent] = useState(hasAiConsent());
  const [code, setCode] = useState(getAccessCode());
  const [key, setKey] = useState(getGeminiKey());
  const [persistKey, setPersistKey] = useState(isPersisted('gemini'));
  const [model, setModel] = useState(getGeminiModel());
  const [models, setModels] = useState<string[]>([]);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelMsg, setModelMsg] = useState('');

  const loadModels = async () => {
    setModelBusy(true);
    setModelMsg('');
    try {
      const r = await fetchModels();
      setModels(r.models);
      setModelMsg(
        r.fromApi
          ? `이 키로 쓸 수 있는 모델 ${r.models.length}개를 불러왔습니다. 추천: ${r.recommended ?? '-'}`
          : '모델 목록을 가져오지 못해 기본 후보를 보여 줍니다.',
      );
    } catch (e) {
      setModelMsg(e instanceof ApiError ? e.message : '모델 목록을 불러오지 못했습니다.');
    } finally {
      setModelBusy(false);
    }
  };

  useEffect(() => {
    fetchHealth().then(setHealth);
  }, []);

  return (
    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 md:col-span-2">
      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">🤖 AI 분석 (Gemini)</h4>

      <p className="text-xs">
        상태:{' '}
        {health === undefined ? (
          <span className="text-slate-400">확인 중...</span>
        ) : health === null ? (
          <span className="text-amber-600">서버 API에 연결되지 않음 (정적 호스팅이거나 개발 서버가 아닙니다)</span>
        ) : key.trim() ? (
          <span className="text-emerald-600 font-semibold">내 Gemini 키로 AI 사용 가능</span>
        ) : health.llm ? (
          <span className="text-slate-600">내 Gemini 키를 입력하거나, 운영자에게 받은 접근 코드를 입력하세요</span>
        ) : (
          <span className="text-amber-600">AI를 쓰려면 내 Gemini 키를 입력하세요</span>
        )}
      </p>

      <div className="space-y-1 text-xs">
        <label className="block space-y-1">
          <span className="text-slate-500">
            내 Gemini API 키 (
            <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            에서 무료 발급)
          </span>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setGeminiKey(e.target.value, persistKey);
            }}
            placeholder="AIza..."
            autoComplete="off"
            className="w-full sm:w-96 px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
          />
        </label>
        <label className="flex items-center gap-1.5 text-slate-500">
          <input
            type="checkbox"
            checked={persistKey}
            onChange={(e) => {
              setPersistKey(e.target.checked);
              setGeminiKey(key, e.target.checked);
            }}
          />
          이 브라우저에 계속 기억하기 (끄면 탭을 닫을 때 삭제 · 공용 PC에서는 끄세요)
        </label>
        <p className="text-[11px] text-slate-400">
          키는 이 브라우저에만 보관됩니다. AI를 실행할 때 이 서비스의 서버를 한 번 거쳐 Google로 전달되며, 서버는 저장·기록하지 않습니다.
        </p>
      </div>

      <div className="space-y-1 text-xs">
        <span className="text-slate-500">모델</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setGeminiModel(e.target.value);
            }}
            className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white min-w-56"
          >
            <option value="">자동 (권장) — 이 키로 쓸 수 있는 최신 Flash 모델</option>
            {model && !models.includes(model) && <option value={model}>{model}</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={modelBusy}
            onClick={loadModels}
            className="px-3 py-1.5 font-semibold bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
          >
            {modelBusy ? '불러오는 중...' : '사용 가능한 모델 불러오기'}
          </button>
        </div>
        <p className="text-[11px] text-slate-400">
          &apos;자동&apos;은 키로 조회한 모델 중 가장 적합한 것을 고르고, 사용할 수 없으면 다음 후보로 넘어갑니다. 특정 모델이 필요하면 직접 고르세요.
        </p>
        {modelMsg && <p className="text-[11px] text-slate-600">{modelMsg}</p>}
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            setAiConsent(e.target.checked);
          }}
          className="mt-0.5"
        />
        <span>
          <strong className="text-slate-800">데이터 전송에 동의합니다.</strong> AI 기능을 누를 때에만 해당 공고 본문과 프로젝트 제목·기술·성과 문장이 서버를
          거쳐 Google Gemini로 전송됩니다. 이름·연락처는 보내지 않습니다. 무료 티어에서는 입력이 Google의 서비스 개선에 사용될 수 있으므로 민감한
          내용은 넣지 마세요. 저장은 계속 이 브라우저에만 됩니다.
        </span>
      </label>

      {health?.accessCodeRequired && !key.trim() && (
        <label className="block text-xs space-y-1">
          <span className="text-slate-500">접근 코드 (운영자에게 받은 경우에만 · 서버의 Gemini 키 사용)</span>
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setAccessCode(e.target.value);
            }}
            className="w-full sm:w-64 px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
            autoComplete="off"
          />
        </label>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" />
        운영자의 키는 서버 환경 변수에만 있으며 이 브라우저와 GitHub에는 저장되지 않습니다.
      </p>
    </div>
  );
}
