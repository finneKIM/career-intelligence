import { useState } from 'react';
import { 
  Building2, 
  Briefcase, 
  Tag, 
  Calendar, 
  ExternalLink, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  X,
  Sparkles,
  CheckCircle2,
  ListTodo,
  Award
} from 'lucide-react';
import type { JobDescription, AnalysisResult } from '../../types';
import { db, getOrCreateDefaultProfile } from '../../db';
import { analyzeJobDescriptionMatch, MatchingReportModal } from '../matching';

interface JdDetailCardProps {
  jd: JobDescription;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

export function JdDetailCard({ jd, onUpdate, onDelete }: JdDetailCardProps) {
  const [showRawText, setShowRawText] = useState(false);
  const [newRespItem, setNewRespItem] = useState('');
  const [newQualItem, setNewQualItem] = useState('');
  const [newPrefItem, setNewPrefItem] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 3단계 역량 매칭 분석 실행
  const handleAnalyzeMatch = async () => {
    try {
      setIsAnalyzing(true);
      const profile = await getOrCreateDefaultProfile();
      const projects = await db.projects.toArray();

      // 매칭 엔진 실행
      const result = analyzeJobDescriptionMatch(jd, projects, profile);

      // IndexedDB에 불변 스냅샷 저장
      await db.analysisResults.add(result);

      setAnalysisResult(result);
      setIsReportOpen(true);
    } catch (err) {
      console.error('매칭 분석 실패:', err);
      alert('매칭 분석을 수행하는 도중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 항목 추가 헬퍼
  const handleAddItem = async (section: 'responsibilities' | 'qualifications' | 'preferred', text: string) => {
    if (!text.trim()) return;

    const updatedSections = {
      ...jd.sections,
      [section]: [...jd.sections[section], text.trim()],
    };

    await db.jobDescriptions.update(jd.id, { sections: updatedSections });
    onUpdate();
  };

  // 항목 삭제 헬퍼
  const handleRemoveItem = async (section: 'responsibilities' | 'qualifications' | 'preferred', index: number) => {
    const updatedSections = {
      ...jd.sections,
      [section]: jd.sections[section].filter((_, i) => i !== index),
    };

    await db.jobDescriptions.update(jd.id, { sections: updatedSections });
    onUpdate();
  };

  // 공고 삭제 확인
  const handleDeleteJd = async () => {
    if (window.confirm(`'${jd.company} - ${jd.role}' 공고를 삭제할까요?`)) {
      await db.jobDescriptions.delete(jd.id);
      onDelete(jd.id);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 hover:border-slate-300 transition-all">
      {/* 상단 메타 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
              <Building2 className="w-3.5 h-3.5" />
              <span>{jd.company}</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              <Tag className="w-3.5 h-3.5 text-slate-500" />
              <span>{jd.domain}</span>
            </span>
            <span className="text-[11px] text-slate-400 inline-flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>파싱일: {new Date(jd.parsedAt).toLocaleDateString()}</span>
            </span>
          </div>

          <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Briefcase className="w-5 h-5 text-indigo-600" />
            <span>{jd.role}</span>
          </h3>

          {jd.sourceUrl && (
            <a
              href={jd.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
            >
              <span>공고 원본 링크 바로가기</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* 우측 액션 버튼들 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleDeleteJd}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            title="이 공고 삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3단계 파싱 섹션 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. 주요 업무 (Responsibilities) */}
        <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <ListTodo className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">주요 업무</h4>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              {jd.sections.responsibilities.length}건
            </span>
          </div>

          <ul className="space-y-2 text-xs text-slate-700 flex-1">
            {jd.sections.responsibilities.map((item, idx) => (
              <li key={idx} className="group flex items-start justify-between bg-white p-2.5 rounded-lg border border-slate-200/60 shadow-2xs">
                <span className="flex-1 leading-relaxed mr-2">• {item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem('responsibilities', idx)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 transition-opacity"
                  title="항목 삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {jd.sections.responsibilities.length === 0 && (
              <li className="text-[11px] text-slate-400 italic p-2 text-center">등록된 주요 업무가 없습니다.</li>
            )}
          </ul>

          {/* 인라인 항목 추가 */}
          <div className="pt-2 flex items-center space-x-1.5">
            <input
              type="text"
              value={newRespItem}
              onChange={(e) => setNewRespItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem('responsibilities', newRespItem);
                  setNewRespItem('');
                }
              }}
              placeholder="+ 업무 항목 직접 추가..."
              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                handleAddItem('responsibilities', newRespItem);
                setNewRespItem('');
              }}
              className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. 자격 요건 (Qualifications) */}
        <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold text-slate-900">자격 요건</h4>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              {jd.sections.qualifications.length}건
            </span>
          </div>

          <ul className="space-y-2 text-xs text-slate-700 flex-1">
            {jd.sections.qualifications.map((item, idx) => (
              <li key={idx} className="group flex items-start justify-between bg-white p-2.5 rounded-lg border border-slate-200/60 shadow-2xs">
                <span className="flex-1 leading-relaxed mr-2">• {item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem('qualifications', idx)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 transition-opacity"
                  title="항목 삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {jd.sections.qualifications.length === 0 && (
              <li className="text-[11px] text-slate-400 italic p-2 text-center">등록된 자격 요건이 없습니다.</li>
            )}
          </ul>

          {/* 인라인 항목 추가 */}
          <div className="pt-2 flex items-center space-x-1.5">
            <input
              type="text"
              value={newQualItem}
              onChange={(e) => setNewQualItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem('qualifications', newQualItem);
                  setNewQualItem('');
                }
              }}
              placeholder="+ 자격 요건 직접 추가..."
              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                handleAddItem('qualifications', newQualItem);
                setNewQualItem('');
              }}
              className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. 우대 사항 (Preferred) */}
        <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-600" />
              <h4 className="text-xs font-bold text-slate-900">우대 사항</h4>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              {jd.sections.preferred.length}건
            </span>
          </div>

          <ul className="space-y-2 text-xs text-slate-700 flex-1">
            {jd.sections.preferred.map((item, idx) => (
              <li key={idx} className="group flex items-start justify-between bg-white p-2.5 rounded-lg border border-slate-200/60 shadow-2xs">
                <span className="flex-1 leading-relaxed mr-2">• {item}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem('preferred', idx)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-0.5 transition-opacity"
                  title="항목 삭제"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {jd.sections.preferred.length === 0 && (
              <li className="text-[11px] text-slate-400 italic p-2 text-center">등록된 우대 사항이 없습니다.</li>
            )}
          </ul>

          {/* 인라인 항목 추가 */}
          <div className="pt-2 flex items-center space-x-1.5">
            <input
              type="text"
              value={newPrefItem}
              onChange={(e) => setNewPrefItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddItem('preferred', newPrefItem);
                  setNewPrefItem('');
                }
              }}
              placeholder="+ 우대 사항 직접 추가..."
              className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => {
                handleAddItem('preferred', newPrefItem);
                setNewPrefItem('');
              }}
              className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 하단 푸터: 원문 보기 토글 및 매칭 엔진 안내 */}
      <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowRawText(!showRawText)}
          className="inline-flex items-center space-x-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
        >
          <span>{showRawText ? '원문 접기' : '공고 원문 전체 보기 (Fail-Safe 영구 보존)'}</span>
          {showRawText ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            🔒 IndexedDB 불변 보존
          </span>
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={handleAnalyzeMatch}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAnalyzing ? '역량 대조 분석 중...' : '⚡ 이 공고로 역량 매칭 분석하기'}</span>
          </button>
        </div>
      </div>

      {/* 원문 펼침 뷰 */}
      {showRawText && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
          {jd.rawText}
        </div>
      )}

      {/* 3단계 매칭 결과 리포트 모달 */}
      <MatchingReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        jd={jd}
        result={analysisResult}
      />
    </div>
  );
}
