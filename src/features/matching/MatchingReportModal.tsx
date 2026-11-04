import { useState } from 'react';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  AlertTriangle, 
  Building2, 
  Briefcase, 
  Info,
  Lightbulb,
  FileText
} from 'lucide-react';
import type { JobDescription, AnalysisResult } from '../../types';
import { AiMatchInsight } from '../ai';

interface MatchingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  jd: JobDescription | null;
  result: AnalysisResult | null;
}

type TabType = 'all' | 'direct' | 'indirect' | 'gap';

export function MatchingReportModal({ isOpen, onClose, jd, result }: MatchingReportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');

  if (!isOpen || !jd || !result) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Building2 className="w-3 h-3" />
                <span>{jd.company}</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-600 flex items-center space-x-1">
                <Briefcase className="w-3 h-3 text-slate-400" />
                <span>{jd.role}</span>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              <span>3단계 지능형 역량 매칭 리포트</span>
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 바디 (스크롤 가능) */}
        <div className="overflow-y-auto flex-1 py-5 space-y-6 pr-1">
          {/* 1. 종합 충족도 & 3단계 카운트 요약 카드 */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-700">요구 역량 객관적 충족도</span>
                  <div className="group relative cursor-help">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <div className="hidden group-hover:block absolute left-0 bottom-full mb-1 w-64 p-2 bg-slate-900 text-white text-[11px] rounded-lg shadow-lg z-50 leading-tight">
                      합격 확률이 아니며, 공고의 전체 요구사항 대비 내 프로젝트 성과(직접) 및 보유 기술(간접)이 증명된 객관적 비율입니다.
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {result.summaryScore}%
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    (직접 증명 {result.directMatches.length}건 · 간접 {result.indirectMatches.length}건)
                  </span>
                </div>
              </div>

              {/* 진행률 바 */}
              <div className="w-full sm:w-48 bg-slate-200 rounded-full h-3 overflow-hidden shrink-0">
                <div 
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${result.summaryScore}%` }}
                />
              </div>
            </div>

            {/* 3단계 신호 요약 그리드 */}
            <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60">
              <div 
                onClick={() => setActiveTab('direct')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  activeTab === 'direct' 
                    ? 'bg-emerald-100/70 border-emerald-300 ring-2 ring-emerald-500/20' 
                    : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100/50'
                }`}
              >
                <div className="flex items-center justify-center space-x-1 text-emerald-700 font-bold text-xs mb-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>직접 증명</span>
                </div>
                <div className="text-lg font-extrabold text-emerald-800">
                  {result.directMatches.length}건
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('indirect')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  activeTab === 'indirect' 
                    ? 'bg-blue-100/70 border-blue-300 ring-2 ring-blue-500/20' 
                    : 'bg-blue-50 border-blue-200 hover:bg-blue-100/50'
                }`}
              >
                <div className="flex items-center justify-center space-x-1 text-blue-700 font-bold text-xs mb-0.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>간접 연결</span>
                </div>
                <div className="text-lg font-extrabold text-blue-800">
                  {result.indirectMatches.length}건
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('gap')}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                  activeTab === 'gap' 
                    ? 'bg-amber-100/70 border-amber-300 ring-2 ring-amber-500/20' 
                    : 'bg-amber-50 border-amber-200 hover:bg-amber-100/50'
                }`}
              >
                <div className="flex items-center justify-center space-x-1 text-amber-700 font-bold text-xs mb-0.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>증거 공백</span>
                </div>
                <div className="text-lg font-extrabold text-amber-800">
                  {result.evidenceGaps.length}건
                </div>
              </div>
            </div>
          </div>

          {/* 2. 탭 필터 네비게이션 */}
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              전체 보기 ({result.directMatches.length + result.indirectMatches.length + result.evidenceGaps.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'direct'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              🟢 직접 증명 ({result.directMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('indirect')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'indirect'
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              🔵 간접 연결 ({result.indirectMatches.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gap')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'gap'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              🟠 증거 공백 ({result.evidenceGaps.length})
            </button>
          </div>

          {/* 3. 3단계 상세 매칭 내역 */}
          <div className="space-y-4">
            {/* 직접 증명 목록 */}
            {(activeTab === 'all' || activeTab === 'direct') && result.directMatches.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-emerald-800 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>🟢 직접 증명된 역량 (프로젝트 성과 불릿 근거)</span>
                </h4>
                {result.directMatches.map((m, idx) => (
                  <div key={idx} className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      요구사항: {m.requirement}
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200/80 text-xs text-emerald-900 space-y-1">
                      <div className="flex items-center space-x-1.5 font-semibold text-emerald-700 text-[11px]">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>직접 증빙 근거:</span>
                      </div>
                      <p className="font-mono text-[11px] leading-relaxed">{m.matchedSkillOrExperience}</p>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      💡 {m.description}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 간접 연결 목록 */}
            {(activeTab === 'all' || activeTab === 'indirect') && result.indirectMatches.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-blue-800 flex items-center space-x-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>🔵 간접 연결 경험 (기술 스택 기반 전이 가능)</span>
                </h4>
                {result.indirectMatches.map((m, idx) => (
                  <div key={idx} className="bg-blue-50/50 border border-blue-200 rounded-xl p-3.5 space-y-2">
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      요구사항: {m.requirement}
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-blue-200/80 text-xs text-blue-900 flex items-center space-x-2">
                      <span className="text-[11px] font-semibold text-blue-700 shrink-0">연관 기술:</span>
                      <span className="font-bold text-[11px] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {m.matchedSkillOrExperience}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      💡 {m.description}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* 증거 공백 (Evidence Gap) 목록 */}
            {(activeTab === 'all' || activeTab === 'gap') && result.evidenceGaps.length > 0 && (
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-amber-800 flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>🟠 증거 공백 (Evidence Gap & 보완 가이드)</span>
                </h4>
                {result.evidenceGaps.map((g, idx) => (
                  <div key={idx} className="bg-amber-50/50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      공고 요구사항: {g.requirement}
                    </div>
                    <div className="text-[11px] text-amber-900 bg-amber-100/60 p-2 rounded-lg border border-amber-200">
                      ⚠️ <strong>부족 사유:</strong> {g.missingReason}
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-amber-200/80 text-xs space-y-1">
                      <div className="flex items-center space-x-1.5 font-bold text-amber-800 text-[11px]">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>자소서 / 포트폴리오 보완 가이드:</span>
                      </div>
                      <p className="text-[11px] text-slate-700 leading-relaxed">{g.actionGuide}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* AI 심층 분석 (선택 기능) */}
          <AiMatchInsight jd={jd} />
        </div>

        {/* 모달 푸터 */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400">
            🔒 분석 결과는 IndexedDB에 불변 스냅샷으로 안전 보존됩니다.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            리포트 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
