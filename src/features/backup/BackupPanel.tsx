import { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  BACKUP_TABLES,
  downloadBackup,
  exportAllFromDb,
  parseBackup,
  restoreToDb,
  summarizeBackup,
  type BackupFile,
  type RestoreMode,
  type RestoreSummary,
} from './backupService';

const TABLE_LABELS: Record<(typeof BACKUP_TABLES)[number], string> = {
  profiles: '프로필',
  projects: '프로젝트',
  jobDescriptions: '채용공고',
  applications: '지원 이력',
  analysisResults: '매칭 분석',
  notionConfigs: '노션 설정',
};

interface Props {
  onRestored: () => void | Promise<void>;
}

export function BackupPanel({ onRestored }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [error, setError] = useState('');
  const [done, setDone] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setError('');
    try {
      downloadBackup(await exportAllFromDb());
    } catch (e) {
      setError(`내보내기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleFile = async (file: File | undefined) => {
    setError('');
    setDone(null);
    setPending(null);
    if (!file) return;
    const result = parseBackup(await file.text());
    if (!result.ok) {
      setError(result.error);
    } else {
      setPending(result.backup);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleRestore = async () => {
    if (!pending) return;
    if (mode === 'replace' && !window.confirm('현재 저장된 모든 데이터가 삭제되고 백업 내용으로 대체됩니다. 계속할까요?')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      setDone(await restoreToDb(pending, mode));
      setPending(null);
      await onRestored();
    } catch (e) {
      setError(`복원 실패 (기존 데이터는 변경되지 않았습니다): ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const summary = pending ? summarizeBackup(pending, mode) : null;

  return (
    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">💾 로컬 퍼스트 데이터 관리</h4>

      <button
        type="button"
        onClick={handleExport}
        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>전체 데이터 JSON 백업 다운로드</span>
      </button>
      <p className="text-[11px] text-slate-400 text-center">
        프로필·프로젝트·공고·지원 이력·분석 결과를 모두 포함합니다. 노션 API 키는 보안상 제외됩니다.
      </p>

      <div className="pt-3 border-t border-slate-200 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>백업 파일에서 복원</span>
        </button>

        {pending && summary && (
          <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-3 text-xs">
            <p className="font-semibold text-slate-700">
              백업 시각: {pending.exportedAt ? new Date(pending.exportedAt).toLocaleString('ko-KR') : '알 수 없음'} · 총 {summary.total}건
            </p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-500">
              {BACKUP_TABLES.map((t) => (
                <li key={t}>
                  {TABLE_LABELS[t]}: <strong className="text-slate-700">{summary.counts[t]}</strong>건
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              {(['merge', 'replace'] as const).map((m) => (
                <label
                  key={m}
                  className={`flex-1 text-center px-2 py-1.5 rounded-lg border cursor-pointer font-medium ${
                    mode === m ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <input type="radio" className="hidden" checked={mode === m} onChange={() => setMode(m)} />
                  {m === 'merge' ? '병합 (같은 ID만 덮어쓰기)' : '전체 교체'}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleRestore}
              className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer"
            >
              {busy ? '복원 중...' : '복원 실행'}
            </button>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs text-rose-600">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {done && (
          <p className="flex items-start gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              복원 완료 ({done.mode === 'replace' ? '전체 교체' : '병합'}): 총 {done.total}건을 반영했습니다.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
