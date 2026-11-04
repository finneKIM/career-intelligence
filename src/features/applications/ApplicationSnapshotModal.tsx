import { useState } from 'react';
import { 
  X, 
  Lock, 
  FileText, 
  Building2, 
  Briefcase, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  HelpCircle, 
  AlertTriangle,
  Clock
} from 'lucide-react';
import type { Application } from '../../types';

interface ApplicationSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  application: Application | null;
}

type TabType = 'resume' | 'jd' | 'analysis';

export function ApplicationSnapshotModal({ isOpen, onClose, application }: ApplicationSnapshotModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('resume');

  if (!isOpen || !application) return null;

  const { snapshot } = application;
  const { jdSnapshot, analysisSnapshot } = snapshot;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Building2 className="w-3.5 h-3.5" />
                <span>{application.company}</span>
              </span>
              <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>{application.role}</span>
              </span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Lock className="w-3 h-3 text-amber-600" />
                <span>불변 스냅샷 (Immutable)</span>
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <span>지원 당시 제출 자료 & 분석 스냅샷 복기</span>
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

        {/* 불변 스냅샷 안내 배너 */}
        <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between text-slate-600 shrink-0">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>스냅샷 보존 시점: {new Date(snapshot.snapshotTimestamp).toLocaleString()}</span>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            ※ 현재 프로필이 바뀌어도 이 기록은 영구 고정됩니다.
          </span>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex space-x-2 border-b border-slate-100 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('resume')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'resume'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>당시 제출 서류</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('jd')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'jd'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>당시 채용 공고(JD)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'analysis'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>당시 매칭 분석 결과 ({analysisSnapshot.summaryScore}%)</span>
          </button>
        </div>

        {/* 모달 본문 (스크롤 영역) */}
        <div className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
          {/* 탭 1: 제출 서류 */}
          {activeTab === 'resume' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>당시 제출한 자기소개서 / 지원서 전문</span>
                </label>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {snapshot.resumeText || '(제출된 자기소개서 내용이 없습니다.)'}
                </div>
              </div>

              {snapshot.portfolioUrl && (
                <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-indigo-900 block">제출 포트폴리오 링크</span>
                    <span className="text-slate-500 font-mono text-[11px]">{snapshot.portfolioUrl}</span>
                  </div>
                  <a
                    href={snapshot.portfolioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors inline-flex items-center space-x-1 shrink-0"
                  >
                    <span>열기</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 탭 2: 당시 채용 공고 (JD) */}
          {activeTab === 'jd' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-900 block border-b pb-1">주요 업무</span>
                  <ul className="text-xs text-slate-700 space-y-1">
                    {jdSnapshot.sections.responsibilities.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-900 block border-b pb-1">자격 요건</span>
                  <ul className="text-xs text-slate-700 space-y-1">
                    {jdSnapshot.sections.qualifications.map((q, i) => (
                      <li key={i}>• {q}</li>
                    ))}
                  </ul>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-900 block border-b pb-1">우대 사항</span>
                  <ul className="text-xs text-slate-700 space-y-1">
                    {jdSnapshot.sections.preferred.map((p, i) => (
                      <li key={i}>• {p}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-slate-700">공고 원문 전체</label>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {jdSnapshot.rawText}
                </div>
              </div>
            </div>
          )}

          {/* 탭 3: 당시 매칭 분석 결과 */}
          {activeTab === 'analysis' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700">당시 역량 충족도 점수</span>
                  <div className="text-2xl font-black text-slate-900">{analysisSnapshot.summaryScore}%</div>
                </div>
                <div className="flex space-x-2">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200">
                    직접 {analysisSnapshot.directMatches.length}건
                  </span>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-200">
                    간접 {analysisSnapshot.indirectMatches.length}건
                  </span>
                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-200">
                    공백 {analysisSnapshot.evidenceGaps.length}건
                  </span>
                </div>
              </div>

              {/* 직접 증명 목록 */}
              {analysisSnapshot.directMatches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-emerald-800 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>🟢 직접 증명된 항목</span>
                  </span>
                  {analysisSnapshot.directMatches.map((m, i) => (
                    <div key={i} className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-slate-900">• {m.requirement}</div>
                      <div className="text-emerald-800 font-mono text-[11px]">증거: {m.matchedSkillOrExperience}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 간접 연결 목록 */}
              {analysisSnapshot.indirectMatches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-blue-800 flex items-center space-x-1">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>🔵 간접 연결 항목</span>
                  </span>
                  {analysisSnapshot.indirectMatches.map((m, i) => (
                    <div key={i} className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-slate-900">• {m.requirement}</div>
                      <div className="text-blue-800 text-[11px]">연관 기술: {m.matchedSkillOrExperience}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 증거 공백 목록 */}
              {analysisSnapshot.evidenceGaps.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-800 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>🟠 증거 공백 (Evidence Gap)</span>
                  </span>
                  {analysisSnapshot.evidenceGaps.map((g, i) => (
                    <div key={i} className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-slate-900">• {g.requirement}</div>
                      <div className="text-amber-800 text-[11px]">가이드: {g.actionGuide}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
