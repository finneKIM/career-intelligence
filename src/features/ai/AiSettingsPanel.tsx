import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchHealth, getAccessCode, hasAiConsent, setAccessCode, setAiConsent, type Health } from './aiClient';

export function AiSettingsPanel() {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);
  const [consent, setConsent] = useState(hasAiConsent());
  const [code, setCode] = useState(getAccessCode());

  useEffect(() => {
    fetchHealth().then(setHealth);
  }, []);

  return (
    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 md:col-span-2">
      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">🤖 AI 분석 (Gemini)</h4>

      <p className="text-xs">
        서버 상태:{' '}
        {health === undefined ? (
          <span className="text-slate-400">확인 중...</span>
        ) : health === null ? (
          <span className="text-amber-600">서버 API에 연결되지 않음 (정적 호스팅이거나 개발 서버가 아닙니다)</span>
        ) : health.llm ? (
          <span className="text-emerald-600 font-semibold">AI 사용 가능</span>
        ) : (
          <span className="text-amber-600">서버에 GEMINI_API_KEY가 설정되지 않아 AI를 쓸 수 없습니다</span>
        )}
      </p>

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

      {health?.accessCodeRequired && (
        <label className="block text-xs space-y-1">
          <span className="text-slate-500">접근 코드 (서버 APP_ACCESS_CODE와 동일)</span>
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
        API 키는 서버 환경 변수에만 있으며 이 브라우저와 GitHub에는 저장되지 않습니다.
      </p>
    </div>
  );
}
