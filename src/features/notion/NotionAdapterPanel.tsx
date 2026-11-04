import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ScanSearch } from 'lucide-react';
import { db } from '../../db';
import { ApiError, fetchNotionDatabase, loadNotionCredentials, saveNotionCredentials } from '../ai/aiClient';
import type { NotionColumnMappings } from '../../types';
import {
  mapRowsToProjects,
  parseSource,
  suggestMappings,
  validateMappings,
  type ParsedSource,
} from './notionAdapter';

const CONFIG_ID = 'current-notion-config';

type FieldKey = keyof NotionColumnMappings;
const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: 'title', label: '프로젝트명', required: true },
  { key: 'techStack', label: '기술 스택', required: true },
  { key: 'period', label: '기간', required: true },
  { key: 'outcomes', label: '수행 성과', required: true },
  { key: 'role', label: '담당 역할', required: false },
  { key: 'links', label: '링크', required: false },
];

interface Props {
  onImported: () => void | Promise<void>;
}

export function NotionAdapterPanel({ onImported }: Props) {
  const [text, setText] = useState('');
  const [source, setSource] = useState<ParsedSource | null>(null);
  const [mappings, setMappings] = useState<NotionColumnMappings | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const saved0 = loadNotionCredentials();
  const [token, setToken] = useState(saved0?.token ?? '');
  const [databaseId, setDatabaseId] = useState(saved0?.databaseId ?? '');
  const [remember, setRemember] = useState(!!saved0);
  const [liveBusy, setLiveBusy] = useState(false);

  const handleLive = async () => {
    setError('');
    setMessage('');
    setLiveBusy(true);
    try {
      const data = await fetchNotionDatabase({ token: token.trim(), databaseId: databaseId.trim() });
      saveNotionCredentials(remember ? { token: token.trim(), databaseId: databaseId.trim() } : null);
      const asText = JSON.stringify(data);
      setText(asText);
      await handleScan(asText);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '노션 연동 중 오류가 발생했습니다.');
    } finally {
      setLiveBusy(false);
    }
  };

  const errors = useMemo(
    () => (source && mappings ? validateMappings(mappings, source.schema.properties) : []),
    [source, mappings],
  );

  const handleScan = async (override?: string) => {
    setError('');
    setMessage('');
    const result = parseSource(override ?? text);
    if (!result.ok) {
      setSource(null);
      setMappings(null);
      setError(result.error);
      return;
    }
    setSource(result.data);
    // 저장된 매핑 중 현재 컬럼에 모두 존재하는 것이 있으면 재사용, 아니면 자동 추천
    const saved = await db.notionConfigs.get(CONFIG_ID);
    const names = new Set(result.data.schema.properties.map((p) => p.name));
    const savedOk =
      saved &&
      validateMappings(saved.columnMappings, result.data.schema.properties).length === 0 &&
      Object.values(saved.columnMappings).every((v) => !v || names.has(v));
    setMappings(savedOk ? saved.columnMappings : suggestMappings(result.data.schema.properties));
  };

  const handleImport = async () => {
    if (!source || !mappings || errors.length > 0) return;
    setBusy(true);
    setError('');
    try {
      const existing = (await db.projects.toArray()).map((p) => p.title);
      const { projects, skipped } = mapRowsToProjects(source.rows, mappings, existing);
      if (projects.length > 0) await db.projects.bulkAdd(projects);
      await db.notionConfigs.put({
        id: CONFIG_ID,
        sourceType: text.trim().startsWith('{') || text.trim().startsWith('[') ? 'JSON' : 'CSV',
        columnMappings: mappings,
        lastSyncedAt: new Date().toISOString(),
      });
      setMessage(`프로젝트 ${projects.length}건을 가져왔습니다. (건너뜀 ${skipped.length}건: 빈 제목·중복)`);
      await onImported();
    } catch (e) {
      setError(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">🔗 노션 동적 스키마 어댑터</h4>
      <p className="text-xs text-slate-500">
        노션 DB를 CSV로 내보내거나, 노션 API 응답 JSON을 붙여넣으면 컬럼을 자동 감지해 1:1 매핑을 추천합니다.
        (브라우저 CORS 제약과 토큰 보안을 위해 외부 호출 없이 로컬에서만 처리합니다.)
      </p>

      <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs">
        <p className="font-semibold text-slate-700">노션에서 바로 불러오기</p>
        <p className="text-slate-400">
          노션 설정 &gt; 연결(Integrations)에서 내부 통합을 만들고, 해당 DB에 연결한 뒤 토큰과 DB ID를 입력하세요. 토큰은 이 브라우저에서만 보관되며, 요청할 때 서버가 노션에 전달만 하고 저장·기록하지 않습니다.
        </p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="통합 토큰 (secret_… 또는 ntn_…)"
          autoComplete="off"
          className="w-full px-2 py-1.5 rounded-lg border border-slate-200"
        />
        <input
          type="text"
          value={databaseId}
          onChange={(e) => setDatabaseId(e.target.value)}
          placeholder="데이터베이스 ID (32자리) 또는 DB 주소"
          className="w-full px-2 py-1.5 rounded-lg border border-slate-200"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-slate-500">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            이 브라우저에 기억하기
          </label>
          <button
            type="button"
            disabled={liveBusy || !token.trim() || !databaseId.trim()}
            onClick={handleLive}
            className="px-3 py-1.5 font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            {liveBusy ? '불러오는 중...' : '노션에서 불러오기'}
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-400">또는 CSV / JSON 직접 붙여넣기</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="CSV 또는 JSON을 붙여넣으세요"
        className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <div className="flex items-center gap-2">
        <label className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100">
          파일 선택
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
              e.target.value = '';
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => handleScan()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 cursor-pointer"
        >
          <ScanSearch className="w-4 h-4" />
          스키마 감지
        </button>
      </div>

      {source && mappings && (
        <div className="space-y-3 text-xs">
          <p className="font-semibold text-slate-700">
            감지됨: {source.schema.databaseTitle} · 컬럼 {source.schema.properties.length}개 · 행 {source.rows.length}개
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className="text-slate-500">
                  {f.label}
                  {f.required && <span className="text-rose-500"> *</span>}
                </span>
                <select
                  value={mappings[f.key] ?? ''}
                  onChange={(e) => setMappings({ ...mappings, [f.key]: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                >
                  <option value="">{f.required ? '선택하세요' : '(사용 안 함)'}</option>
                  {source.schema.properties.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {errors.length > 0 && (
            <ul className="text-rose-600 space-y-0.5">
              {errors.map((er) => (
                <li key={er}>• {er}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={busy || errors.length > 0}
            onClick={handleImport}
            className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer"
          >
            {busy ? '가져오는 중...' : `프로젝트로 가져오기 (${source.rows.length}행)`}
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {message && (
        <p className="flex items-start gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
