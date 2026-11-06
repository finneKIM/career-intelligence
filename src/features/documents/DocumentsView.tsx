import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, FilePlus2, FileText, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { db } from '../../db';
import type {
  AnalysisResult, CompanyMaterial, DocKind, GeneratedDocument, JobDescription, Profile, Project, SourceDocument,
} from '../../types';
import {
  ApiError, buildMatchInsightPayload, callLlmDetailed, getLlmTier, readUrlViaServer, type CompanySearchResult, type KeywordsResult, type CompanySummaryResult, type GeneratedResult, type MatchInsightResult,
} from '../ai/aiClient';
import {
  KIND_LABEL, KIND_TASK, buildEvidence, buildGeneratePayload, documentAsText, latestSummary, nextVersion, saveSourceDocument, toGeneratedDocument,
} from './documentService';
import { compareKeywords, extractKeywords, LEVEL_LABEL, mergeAiKeywords, suggestAppeals, summarizeMatches, type Keyword, type KeywordMatch } from '../analysis/keywords';
import { extractFromFile } from './fileExtract';
import { buildDocx, buildPptx, downloadBytes, printAsPdf, safeFilename } from './exporters';

const box = 'bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3';
const field = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600';
const btn = 'px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50';
const btnPrimary = `${btn} bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700`;
const btnGhost = `${btn} bg-white text-slate-700 border-slate-200 hover:bg-slate-50`;

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');

export function DocumentsView() {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sources, setSources] = useState<SourceDocument[]>([]);
  const [jdId, setJdId] = useState('');
  const [materials, setMaterials] = useState<CompanyMaterial[]>([]);
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [snapshots, setSnapshots] = useState<AnalysisResult[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [j, p, pr, s] = await Promise.all([db.jobDescriptions.toArray(), db.projects.toArray(), db.profiles.get('current-user'), db.sourceDocuments.toArray()]);
    setJds(j.sort((a, b) => b.parsedAt.localeCompare(a.parsedAt)));
    setProjects(p);
    setProfile(pr ?? null);
    setSources(s.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshJd = useCallback(async (id: string) => {
    if (!id) return setMaterials([]), setDocs([]), setSnapshots([]);
    setSnapshots((await db.analysisResults.where('jdId').equals(id).toArray()).filter((a) => a.analysisVersion === 'v2-ai').sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt)));
    setMaterials((await db.companyMaterials.where('jdId').equals(id).toArray()).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)));
    setDocs((await db.generatedDocuments.where('jdId').equals(id).toArray()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }, []);
  useEffect(() => {
    void refreshJd(jdId);
  }, [jdId, refreshJd]);

  const jd = useMemo(() => jds.find((j) => j.id === jdId) ?? null, [jds, jdId]);
  const summary = useMemo(() => latestSummary(materials), [materials]);

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  // ---- 과거 자료 ----
  const [sKind, setSKind] = useState<DocKind>('RESUME');
  const [sTitle, setSTitle] = useState('');
  const [sBody, setSBody] = useState('');

  // ---- 기업 자료 ----
  const [mType, setMType] = useState<'PASTE' | 'URL'>('PASTE');
  const [mTitle, setMTitle] = useState('');
  const [mUrl, setMUrl] = useState('');
  const [mContent, setMContent] = useState('');

  const addMaterial = () =>
    guard('material', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      if (!mContent.trim() && !mUrl.trim()) throw new Error('붙여 넣을 본문이나 출처 URL 중 하나는 필요합니다.');
      const now = new Date().toISOString();
      const m: CompanyMaterial = {
        id: crypto.randomUUID(), jdId: jd.id, sourceType: mType, title: mTitle.trim() || (mType === 'URL' ? mUrl.trim() : '붙여 넣은 자료'),
        url: mUrl.trim() || undefined, content: mContent.trim(), collectedAt: now,
        // URL은 자동 수집하지 않는다(접근 정책·약관 준수). 본문이 없으면 "수집 안 됨"으로 명확히 기록
        status: mContent.trim() ? 'OK' : 'FAILED',
        failureReason: mContent.trim() ? undefined : '본문이 없어 출처만 기록했습니다. "URL 읽어 오기 시도"를 누르거나 해당 페이지의 내용을 복사해 붙여 넣어 주세요.',
        updatedAt: now,
      };
      await db.companyMaterials.put(m);
      setMTitle(''); setMUrl(''); setMContent('');
      await refreshJd(jd.id);
    });

  const tryReadUrl = () =>
    guard('readurl', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      const url = mUrl.trim();
      if (!url) throw new Error('읽어 올 URL을 입력해 주세요.');
      const r = await readUrlViaServer(url);
      const now = new Date().toISOString();
      await db.companyMaterials.put({
        id: crypto.randomUUID(), jdId: jd.id, sourceType: 'URL', title: mTitle.trim() || (r.ok && r.title ? r.title : url), url: r.ok ? r.finalUrl : url,
        content: r.ok ? r.text : '', collectedAt: now, status: r.ok ? 'OK' : 'FAILED', failureReason: r.ok ? undefined : r.reason, updatedAt: now,
      });
      setMUrl(''); setMTitle('');
      await refreshJd(jd.id);
      if (r.ok) setNotice(`페이지에서 ${r.text.length.toLocaleString()}자를 읽어 왔습니다${r.truncated ? ' (앞부분만)' : ''}. 내용이 맞는지 확인하세요.`);
      else setError(r.reason);
    });

  const searchCompany = () =>
    guard('search', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      const out = await callLlmDetailed<CompanySearchResult>('company-search', { company: jd.company, role: jd.role });
      const now = new Date().toISOString();
      await db.companyMaterials.put({
        id: crypto.randomUUID(), jdId: jd.id, sourceType: 'SEARCH', title: `Google 검색: ${jd.company}`, content: out.result.summary, sources: out.result.sources,
        collectedAt: now, status: 'OK', updatedAt: now,
      });
      await refreshJd(jd.id);
      setNotice(`검색 결과를 기업 자료로 추가했습니다(출처 ${out.result.sources.length}건). 사실 여부는 출처에서 확인하세요. 필요 없는 항목은 삭제할 수 있습니다.`);
    });

  const summarize = () =>
    guard('summary', async () => {
      const usable = materials.filter((m) => m.status === 'OK' && m.content);
      if (usable.length === 0) throw new Error('요약할 기업 자료(본문)가 없습니다.');
      const out = await callLlmDetailed<CompanySummaryResult>('company-summary', { materials: usable.map((m) => ({ title: m.title, content: m.content })) });
      const target = usable[0];
      await db.companyMaterials.put({
        ...target,
        summary: { ...out.result, generatedAt: new Date().toISOString(), model: out.model },
        updatedAt: new Date().toISOString(),
      });
      setNotice(`기업 요약을 만들었습니다 (개인정보 ${out.redactedCount}건 가림 후 전송).`);
      await refreshJd(jdId);
    });

  // ---- 6-C 핵심 키워드 · 어필 후보 ----
  const [matches, setMatches] = useState<KeywordMatch[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [aiTerms, setAiTerms] = useState<{ term: string }[]>([]);
  const [customTerm, setCustomTerm] = useState('');
  const companyText = useMemo(() => materials.filter((m) => m.status === 'OK').map((m) => m.content).join('\n').slice(0, 4000), [materials]);

  const runKeywords = (extra: { term: string }[] = aiTerms) => {
    if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
    let kws: Keyword[] = extractKeywords({ jd, companyText });
    if (extra.length) kws = mergeAiKeywords(kws, extra);
    const m = compareKeywords(kws, profile, projects, sources);
    setMatches(m);
    setPicked(new Set(suggestAppeals(m).map((x) => x.term)));
  };
  const analyzeKeywords = () => guard('kw', async () => runKeywords());
  const boostKeywords = () =>
    guard('kwai', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      const jdText = [jd.rawText, ...jd.sections.qualifications, ...jd.sections.responsibilities, ...jd.sections.preferred].join('\n').slice(0, 6000);
      const out = await callLlmDetailed<KeywordsResult>('extract-keywords', { jdText, companyText });
      setAiTerms(out.result.keywords);
      runKeywords(out.result.keywords);
      setNotice(`AI가 원문에 실제로 있는 키워드 ${out.result.keywords.length}개를 보강했습니다(원문에 없는 단어는 서버가 제외).`);
    });
  const addCustomTerm = () => {
    const term = customTerm.trim();
    if (term.length < 2 || matches.some((m) => m.term.toLowerCase() === term.toLowerCase())) return;
    const [m] = compareKeywords([{ term, weight: 3, origins: [] }], profile, projects, sources);
    setMatches([...matches, m]);
    setPicked(new Set([...picked, m.term]));
    setCustomTerm('');
  };
  const selectedAppeals = useMemo(() => matches.filter((m) => picked.has(m.term) && m.level !== 'UNCONFIRMED'), [matches, picked]);

  const insightSnapshot = () =>
    guard('insight', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      const base = (await db.analysisResults.where('jdId').equals(jd.id).toArray()).sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))[0];
      if (!base) throw new Error('이 공고의 기본 매칭 분석 기록이 없습니다. 채용공고 분석기에서 먼저 분석을 저장해 주세요.');
      const kwm = matches.length > 0 ? matches : compareKeywords(extractKeywords({ jd, companyText }), profile, projects, sources);
      const out = await callLlmDetailed<MatchInsightResult>('match-insight', buildMatchInsightPayload(jd, projects, profile, summary));
      const sum = summarizeMatches(kwm);
      // 과거 분석을 덮어쓰지 않고, 시점·모델·버전을 기록한 새 스냅샷을 추가한다
      const snap: AnalysisResult = {
        ...base, id: crypto.randomUUID(), analyzedAt: new Date().toISOString(), analysisVersion: 'v2-ai',
        aiInsight: {
          ...out.result, model: out.model, companyContextUsed: !!summary,
          keywords: kwm.slice(0, 15).map((k) => ({ term: k.term, level: k.level, weight: k.weight })), strengths: sum.strengths, improvements: sum.improvements,
        },
      };
      await db.analysisResults.put(snap);
      await refreshJd(jd.id);
      setNotice('AI 심층 분석 스냅샷을 새 기록으로 저장했습니다(기존 분석은 그대로). 합격 가능성을 예측하는 값이 아닙니다.');
    });

  // ---- 문서 생성 ----
  const [kinds, setKinds] = useState<Record<DocKind, boolean>>({ RESUME: true, COVER_LETTER: false, PORTFOLIO: false });
  const [editing, setEditing] = useState<GeneratedDocument | null>(null);

  const [useAppeals, setUseAppeals] = useState(true);

  const generate = (only?: DocKind[]) =>
    guard('generate', async () => {
      if (!jd) throw new Error('먼저 공고를 선택해 주세요.');
      const selected = only ?? (Object.keys(kinds) as DocKind[]).filter((k) => kinds[k]);
      if (selected.length === 0) throw new Error('만들 문서를 하나 이상 선택해 주세요.');
      const appeals = useAppeals ? selectedAppeals : [];
      const preferIds = appeals.flatMap((a) => a.evidence.filter((e) => e.type !== 'skill' && e.type !== 'source').map((e) => e.refId.split('#')[0]));
      const evidence = buildEvidence(jd, projects, profile, 45, preferIds);
      if (evidence.length === 0) throw new Error('근거로 쓸 프로젝트·기술이 없습니다. 먼저 프로필과 프로젝트를 입력해 주세요.');
      let made = 0;
      let dropped = 0;
      for (const kind of selected) {
        const past = sources.filter((s) => s.kind === kind);
        const out = await callLlmDetailed<GeneratedResult>(KIND_TASK[kind], buildGeneratePayload(jd, evidence, summary, past, appeals));
        const prev = docs.filter((d) => d.kind === kind)[0];
        await db.generatedDocuments.put(toGeneratedDocument(kind, jd, out.result, evidence, profile, {
          model: out.model, previousVersionId: prev?.id,
          appealPoints: appeals.map((a) => ({ term: a.term, level: a.level === 'DIRECT' ? ('DIRECT' as const) : ('INDIRECT' as const) })),
        }));
        made++;
        dropped += out.result.dropped;
      }
      setNotice(`${made}개 문서를 초안으로 만들었습니다${appeals.length ? `(어필 포인트 ${appeals.length}개 반영)` : ''}.${dropped ? ` 근거가 없거나 새 수치가 든 ${dropped}개 문단은 자동으로 제외했습니다.` : ''} 반드시 검수한 뒤 확정하세요.`);
      await refreshJd(jd.id);
    });

  const exporting = async (doc: GeneratedDocument, how: 'docx' | 'pptx' | 'pdf') =>
    guard('export', async () => {
      if (how === 'pdf') {
        if (!printAsPdf(doc, profile)) throw new Error('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.');
        return setNotice('인쇄 창에서 "PDF로 저장"을 선택해 주세요.');
      }
      if (how === 'docx') downloadBytes(await buildDocx(doc, profile), safeFilename(doc, 'docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      else downloadBytes(await buildPptx(doc, profile), safeFilename(doc, 'pptx'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">맞춤 문서 생성</h2>
        <p className="text-xs text-slate-500 mt-1">
          내 프로젝트·성과를 근거로 이력서·자기소개서·포트폴리오 초안을 만듭니다. 근거가 없는 문장과 원문에 없는 수치는 자동으로 제외되며, 직접 검수·확정하기 전에는 초안입니다.
        </p>
      </div>
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
      {notice && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</p>}

      {/* 1. 과거 자료 */}
      <section className={box}>
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><FileText className="w-4 h-4 text-indigo-600" /> 1. 과거에 제출한 자료 (선택)</h3>
        <p className="text-[11px] text-slate-500">옛 이력서·자소서·포트폴리오 글을 붙여 넣으면 문체·구성을 참고합니다(사실 근거는 프로젝트 자료만 사용). 이름·연락처는 저장 전에 자리표시자로 바뀝니다.</p>
        <div className="grid sm:grid-cols-[140px_1fr] gap-2">
          <select className={field} value={sKind} onChange={(e) => setSKind(e.target.value as DocKind)}>
            {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input className={field} placeholder="제목 (예: 2025 상반기 지원용)" value={sTitle} onChange={(e) => setSTitle(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <label className={`${btnGhost} cursor-pointer`}>
            <FileDown className="w-3.5 h-3.5 rotate-180" /> PDF·Word(.docx)·텍스트 파일에서 글자 가져오기
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.doc"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                void guard('file', async () => {
                  const r = await extractFromFile(f.name, new Uint8Array(await f.arrayBuffer()));
                  if (!r.ok) throw new Error(r.reason);
                  setSBody(r.text);
                  if (!sTitle.trim()) setSTitle(f.name.replace(/\.[^.]+$/, ''));
                  setNotice(`${f.name}에서 ${r.text.length.toLocaleString()}자를 가져왔습니다.${r.truncated ? ' (너무 길어 앞부분만 가져왔습니다)' : ''} 내용을 확인하고 "저장"을 눌러 주세요. 원본 파일은 저장하지 않습니다.`);
                });
              }}
            />
          </label>
          {busy === 'file' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>스캔본(이미지) PDF와 구형 .doc는 읽을 수 없습니다. 파일은 이 브라우저 안에서만 처리됩니다.</span>
        </div>
        <textarea className={field} rows={4} placeholder="본문 붙여 넣기 (또는 위에서 파일 가져오기)" value={sBody} onChange={(e) => setSBody(e.target.value)} />
        <button type="button" className={btnPrimary} disabled={!sBody.trim()} onClick={() => guard('src', async () => {
          await saveSourceDocument(db, { kind: sKind, title: sTitle, body: sBody }, profile);
          setSTitle(''); setSBody(''); await refresh();
        })}><FilePlus2 className="w-3.5 h-3.5" /> 저장</button>
        <ul className="divide-y divide-slate-100 text-xs">
          {sources.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-2">
              <span><strong>[{KIND_LABEL[s.kind]}]</strong> {s.title} <span className="text-slate-400">· {s.body.length.toLocaleString()}자 · {s.updatedAt.slice(0, 10)}</span></span>
              <button type="button" className="text-rose-500 hover:text-rose-700 cursor-pointer" onClick={() => window.confirm('이 자료를 삭제할까요?') && db.sourceDocuments.delete(s.id).then(refresh)}><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
          {sources.length === 0 && <li className="py-2 text-slate-400">저장된 과거 자료가 없습니다.</li>}
        </ul>
      </section>

      {/* 공고 선택 */}
      <section className={box}>
        <h3 className="text-sm font-bold text-slate-900">대상 공고</h3>
        <select className={field} value={jdId} onChange={(e) => setJdId(e.target.value)}>
          <option value="">공고를 선택하세요</option>
          {jds.map((j) => <option key={j.id} value={j.id}>{j.company} · {j.role}</option>)}
        </select>
        {jds.length === 0 && <p className="text-[11px] text-slate-500">저장된 공고가 없습니다. 채용공고 분석기에서 공고를 먼저 저장해 주세요.</p>}
      </section>

      {jd && (
        <>
          {/* 2. 기업 자료 */}
          <section className={box}>
            <h3 className="text-sm font-bold text-slate-900">2. 기업 자료 & 맥락 반영 분석</h3>
            <p className="text-[11px] text-slate-500">
              회사 소개·채용 페이지·기사 등의 내용을 붙여 넣거나, URL을 입력해 읽어 오기를 시도할 수 있습니다(사이트가 허용하는 경우만). 읽지 못하면 사유를 알려 드리니 내용을 붙여 넣어 주세요.
            </p>
            <div className="grid sm:grid-cols-[120px_1fr_1fr] gap-2">
              <select className={field} value={mType} onChange={(e) => setMType(e.target.value as 'PASTE' | 'URL')}>
                <option value="PASTE">붙여넣기</option>
                <option value="URL">URL(출처)</option>
              </select>
              <input className={field} placeholder="제목" value={mTitle} onChange={(e) => setMTitle(e.target.value)} />
              <input className={field} placeholder="출처 URL (선택)" value={mUrl} onChange={(e) => setMUrl(e.target.value)} />
            </div>
            <textarea className={field} rows={4} placeholder="기업 자료 본문 붙여 넣기" value={mContent} onChange={(e) => setMContent(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={addMaterial} disabled={!!busy}><FilePlus2 className="w-3.5 h-3.5" /> 자료 추가(붙여넣은 내용)</button>
              <button type="button" className={btnGhost} onClick={tryReadUrl} disabled={!!busy || !mUrl.trim()} title="robots.txt를 확인한 뒤 페이지 글자만 읽어 옵니다. 막혀 있으면 사유를 알려 드립니다.">
                {busy === 'readurl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 rotate-180" />} URL 읽어 오기 시도
              </button>
              {getLlmTier() === 'PAID' && (
                <button type="button" className={btnGhost} onClick={searchCompany} disabled={!!busy}>
                  {busy === 'search' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Google 검색으로 기업 정보 찾기(유료 키)
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">URL 읽기는 사이트의 자동 수집 허용(robots.txt)을 지킵니다. 로그인이 필요하거나 막힌 페이지는 읽지 않으니 내용을 붙여 넣어 주세요. 사이트 이용약관은 직접 확인해 주세요.</p>
            <ul className="divide-y divide-slate-100 text-xs">
              {materials.map((m) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-2">
                  <span>
                    <strong>{m.title}</strong> <span className="text-slate-400">· {m.collectedAt.slice(0, 10)}</span>{' '}
                    {m.status === 'OK' ? <span className="text-emerald-600">{m.sourceType === 'SEARCH' ? '검색됨' : m.sourceType === 'URL' ? '읽어 옴' : '입력됨'}</span> : <span className="text-amber-600" title={m.failureReason}>읽지 못함 — 붙여넣기 필요</span>}
                    {m.url && <span className="text-slate-400"> · 출처 {m.url}</span>}
                    {m.sources && m.sources.length > 0 && <span className="text-slate-400"> · 출처 {m.sources.map((x) => x.title || x.url).slice(0, 3).join(', ')} 등 {m.sources.length}건</span>}
                    {m.status === 'FAILED' && m.failureReason && <span className="block text-[10px] text-amber-600">{m.failureReason}</span>}
                  </span>
                  <button type="button" className="text-rose-500 cursor-pointer" onClick={() => db.companyMaterials.delete(m.id).then(() => refreshJd(jdId))}><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
              {materials.length === 0 && <li className="py-2 text-slate-400">아직 기업 자료가 없습니다.</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnGhost} disabled={!!busy || materials.length === 0} onClick={summarize}>
                {busy === 'summary' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI로 기업 요약
              </button>
              <button type="button" className={btnGhost} disabled={!!busy} onClick={insightSnapshot}>
                {busy === 'insight' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 기업 맥락 반영 AI 분석 저장
              </button>
            </div>
            {summary && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-800">기업 요약 <span className="font-normal text-slate-400">({summary.generatedAt.slice(0, 10)} · {summary.model})</span></p>
                <p>{summary.overview}</p>
                {summary.keyPoints.length > 0 && <ul className="list-disc pl-5">{summary.keyPoints.map((k) => <li key={k}>{k}</li>)}</ul>}
                {summary.talentTraits.length > 0 && <p className="text-slate-600">인재상: {summary.talentTraits.join(' / ')}</p>}
                <p className="text-[10px] text-slate-400">AI가 붙여 넣은 자료만으로 정리한 내용입니다. 사실 여부는 원문과 대조해 확인하세요.</p>
              </div>
            )}
          </section>

          {/* 3. 핵심 키워드 · 어필 후보 (6-C) */}
          <section className={box}>
            <h3 className="text-sm font-bold text-slate-900">3. 핵심 키워드 & 어필 후보</h3>
            <p className="text-[11px] text-slate-500">
              공고·기업 자료에서 중요한 단어를 규칙으로 뽑아 내 자료와 대조합니다. 단어가 나온다고 경험이 있다고 보지 않고, 기술 스택·성과에 있으면 <strong>직접</strong>, 설명·과거 자료에만 있으면 <strong>간접</strong>, 없으면 <strong>확인되지 않음</strong>입니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={!!busy} onClick={analyzeKeywords}>{busy === 'kw' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 키워드 분석</button>
              <button type="button" className={btnGhost} disabled={!!busy} onClick={boostKeywords} title="AI가 뽑은 키워드는 원문에 실제로 있는 표현만 남깁니다">{busy === 'kwai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI로 키워드 보강</button>
            </div>
            {matches.length > 0 && (
              <>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-indigo-900">어필 후보 (선택·제외 가능, 선택한 항목이 문서 생성에 반영됩니다)</p>
                  {selectedAppeals.length === 0 && <p className="text-[11px] text-slate-500">직접·간접 경험이 확인된 후보가 없습니다. 프로젝트의 기술 스택·성과를 먼저 채워 주세요.</p>}
                  {matches.filter((m) => picked.has(m.term)).map((m) => (
                    <label key={m.term} className="flex items-start gap-2 text-xs">
                      <input type="checkbox" checked onChange={() => { const n = new Set(picked); n.delete(m.term); setPicked(n); }} className="mt-0.5" />
                      <span>
                        <strong>{m.term}</strong>{' '}
                        <span className={m.level === 'DIRECT' ? 'text-emerald-600' : m.level === 'INDIRECT' ? 'text-sky-600' : 'text-amber-600'}>{LEVEL_LABEL[m.level]}</span>
                        {m.level === 'UNCONFIRMED' && <span className="text-amber-600"> · 근거가 없어 생성에는 쓰이지 않습니다</span>}
                        {m.evidence.length > 0 && <span className="text-slate-500"> · 근거: {m.evidence.slice(0, 3).map((e) => e.label).join(', ')}</span>}
                      </span>
                    </label>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input className={`${field} !py-1.5 !text-xs`} placeholder="직접 추가할 키워드" value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustomTerm()} />
                    <button type="button" className={btnGhost} onClick={addCustomTerm}>추가</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">선택</th><th className="pr-2">키워드</th><th className="pr-2">중요도</th><th className="pr-2">내 경험</th><th>근거</th></tr></thead>
                    <tbody>
                      {matches.map((m) => (
                        <tr key={m.term} className="border-t border-slate-100">
                          <td className="py-1 pr-2"><input type="checkbox" checked={picked.has(m.term)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(m.term); else n.delete(m.term); setPicked(n); }} /></td>
                          <td className="pr-2 font-semibold">{m.term}{m.origins.includes('AI') && <span className="ml-1 text-[9px] text-violet-500">AI</span>}</td>
                          <td className="pr-2 text-slate-500">{m.weight}</td>
                          <td className={`pr-2 ${m.level === 'DIRECT' ? 'text-emerald-600' : m.level === 'INDIRECT' ? 'text-sky-600' : 'text-amber-600'}`}>{LEVEL_LABEL[m.level]}</td>
                          <td className="text-slate-500">{m.evidence.slice(0, 2).map((e) => e.label).join(', ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {snapshots.length > 0 && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-800">저장된 AI 심층 분석(v2) — 불변 기록 {snapshots.length}건</p>
                {snapshots.slice(0, 3).map((a) => (
                  <details key={a.id} className="text-slate-700">
                    <summary className="cursor-pointer">{a.analyzedAt.slice(0, 16).replace('T', ' ')} · {a.aiInsight?.model} · {a.aiInsight?.companyContextUsed ? '기업 맥락 반영' : '기업 맥락 없음'}</summary>
                    <div className="pl-3 pt-1 space-y-1">
                      {a.aiInsight?.summary && <p>{a.aiInsight.summary}</p>}
                      {a.aiInsight?.strengths && a.aiInsight.strengths.length > 0 && <div><span className="font-semibold text-emerald-700">장점</span><ul className="list-disc pl-5">{a.aiInsight.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                      {a.aiInsight?.improvements && a.aiInsight.improvements.length > 0 && <div><span className="font-semibold text-amber-700">보완점</span><ul className="list-disc pl-5">{a.aiInsight.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                      <p className="text-[10px] text-slate-400">분석 버전 {a.analysisVersion} · 합격 가능성을 예측하는 값이 아닙니다.</p>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          {/* 4. 문서 생성 */}
          <section className={box}>
            <h3 className="text-sm font-bold text-slate-900">4. 문서 생성</h3>
            <div className="flex flex-wrap gap-4 text-xs">
              {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} /> {KIND_LABEL[k]}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={useAppeals} onChange={(e) => setUseAppeals(e.target.checked)} /> 3단계에서 선택한 어필 포인트 반영 ({selectedAppeals.length}개)</label>
            <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => generate()}>
              {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 선택한 문서 만들기
            </button>
            <button type="button" className={btnGhost} disabled={!!busy || selectedAppeals.length === 0} onClick={() => generate(['RESUME'])} title="선택한 어필 포인트를 중심으로 이력서만 다시 만듭니다(이전 버전은 보존)">
              {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 선택한 어필 포인트로 이력서 재생성
            </button>
            </div>
            <p className="text-[11px] text-slate-500">AI 기능 사용 동의가 필요합니다(설정 탭). 프로필 이름·연락처는 전송하지 않으며, 문장마다 근거(프로젝트·성과)가 연결됩니다.</p>

            <ul className="divide-y divide-slate-100 text-xs">
              {docs.map((d) => (
                <li key={d.id} className="py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      <strong>[{KIND_LABEL[d.kind]}]</strong> {d.title}{' '}
                      {d.status === 'CONFIRMED' ? <span className="text-emerald-600 inline-flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" />확정</span> : <span className="text-amber-600">초안</span>}
                      <span className="text-slate-400"> · {d.updatedAt.slice(0, 16).replace('T', ' ')} · {d.model} · {d.analysisVersion}{d.previousVersionId ? ' · 이전 버전 있음' : ''}{d.appealPoints?.length ? ` · 어필: ${d.appealPoints.map((a) => a.term).join(', ')}` : ''}</span>
                    </span>
                    <span className="flex gap-1.5">
                      <button type="button" className={btnGhost} onClick={() => setEditing(d)}>검수·수정</button>
                    </span>
                  </div>
                </li>
              ))}
              {docs.length === 0 && <li className="py-2 text-slate-400">아직 만든 문서가 없습니다.</li>}
            </ul>
          </section>
        </>
      )}

      {editing && (
        <DocEditor
          doc={editing}
          profile={profile}
          onClose={() => setEditing(null)}
          onSave={async (sections, status) => {
            await db.generatedDocuments.put(nextVersion(editing, { sections, status }));
            setEditing(null);
            await refreshJd(jdId);
            setNotice(status === 'CONFIRMED' ? '확정본을 새 버전으로 저장했습니다(이전 버전은 보존).' : '수정본을 새 버전으로 저장했습니다(이전 버전은 보존).');
          }}
          onExport={exporting}
        />
      )}
    </div>
  );
}

function DocEditor({
  doc, profile, onClose, onSave, onExport,
}: {
  doc: GeneratedDocument;
  profile: Profile | null;
  onClose: () => void;
  onSave: (sections: GeneratedDocument['sections'], status: GeneratedDocument['status']) => Promise<void>;
  onExport: (doc: GeneratedDocument, how: 'docx' | 'pptx' | 'pdf') => Promise<void>;
}) {
  const [sections, setSections] = useState(doc.sections);
  const dirty = JSON.stringify(sections) !== JSON.stringify(doc.sections);
  const noEvidence = sections.reduce((n, s) => n + s.paragraphs.filter((p) => p.evidence.length === 0).length, 0);
  const isDeck = doc.kind === 'PORTFOLIO';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{doc.title} — 검수</h3>
            <p className="text-[11px] text-slate-500">{doc.status === 'CONFIRMED' ? '확정본' : '초안'} · 모델 {doc.model} · 생성 {doc.generatedAt.slice(0, 16).replace('T', ' ')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg cursor-pointer">×</button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> AI 초안입니다. 사실과 다른 내용이 없는지 직접 확인하고, 근거 표시가 없는 문장은 특히 주의하세요. 이름·연락처는 내보낼 때 자동으로 채워집니다.
          </p>
          {noEvidence > 0 && <p className="text-[11px] text-rose-600">근거가 연결되지 않은 문장이 {noEvidence}개 있습니다(직접 추가한 문장이거나 근거 삭제됨).</p>}
          {sections.map((s, si) => (
            <div key={si} className="space-y-2">
              <input className={`${field} font-semibold`} value={s.heading} onChange={(e) => setSections(sections.map((x, i) => (i === si ? { ...x, heading: e.target.value } : x)))} />
              {s.paragraphs.map((p, pi) => (
                <div key={pi} className="space-y-1">
                  <textarea
                    className={field}
                    rows={isDeck ? 2 : 3}
                    value={p.text}
                    onChange={(e) => setSections(sections.map((x, i) => (i === si ? { ...x, paragraphs: x.paragraphs.map((y, j) => (j === pi ? { ...y, text: e.target.value } : y)) } : x)))}
                  />
                  <div className="flex flex-wrap gap-1">
                    {p.evidence.length === 0 ? <span className="text-[10px] text-rose-500">근거 없음</span> : p.evidence.map((e, k) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100" title={e.refId}>{e.type === 'outcome' ? '성과' : e.type === 'project' ? '프로젝트' : '기술'}: {e.label}</span>
                    ))}
                    <button type="button" className="text-[10px] text-rose-500 cursor-pointer" onClick={() => setSections(sections.map((x, i) => (i === si ? { ...x, paragraphs: x.paragraphs.filter((_, j) => j !== pi) } : x)).filter((x) => x.paragraphs.length > 0))}>문장 삭제</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button type="button" className={btnGhost} onClick={() => onExport({ ...doc, sections }, 'pdf')}><FileDown className="w-3.5 h-3.5" /> PDF</button>
            {isDeck ? (
              <button type="button" className={btnGhost} onClick={() => onExport({ ...doc, sections }, 'pptx')}><FileDown className="w-3.5 h-3.5" /> PPTX</button>
            ) : (
              <button type="button" className={btnGhost} onClick={() => onExport({ ...doc, sections }, 'docx')}><FileDown className="w-3.5 h-3.5" /> Word(DOCX)</button>
            )}
            <button type="button" className={btnGhost} onClick={() => navigator.clipboard?.writeText(documentAsText({ ...doc, sections }, profile))}>텍스트 복사</button>
          </div>
          <div className="flex gap-1.5">
            <button type="button" className={btnGhost} disabled={!dirty} onClick={() => onSave(sections, 'DRAFT')}>수정본으로 저장</button>
            <button type="button" className={btnPrimary} onClick={() => onSave(sections, 'CONFIRMED')}><CheckCircle2 className="w-3.5 h-3.5" /> 검수 완료·확정</button>
          </div>
        </div>
        {isDeck && <p className="px-6 pb-3 text-[10px] text-slate-400">구형 PPT(.ppt)는 지원하지 않습니다. PowerPoint에서 PPTX를 열어 다른 이름으로 저장할 수 있습니다.</p>}
      </div>
    </div>
  );
}
