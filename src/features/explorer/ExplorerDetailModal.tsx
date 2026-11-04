import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  Compass, 
  ArrowRight,
  TrendingUp,
  Briefcase,
  Layers
} from 'lucide-react';
import type { MatrixCell } from './explorerEngine';

interface ExplorerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cell: MatrixCell | null;
}

export function ExplorerDetailModal({ isOpen, onClose, cell }: ExplorerDetailModalProps) {
  if (!isOpen || !cell) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 상단 헤더 */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                <Briefcase className="w-3 h-3" />
                <span>{cell.role}</span>
              </span>
              <span className="text-xs text-slate-400">×</span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                <Layers className="w-3 h-3" />
                <span>{cell.domain}</span>
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <Compass className="w-5 h-5 text-indigo-600" />
              <span>인접 커리어 심층 진단 & 학습 로드맵</span>
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 본문 (스크롤) */}
        <div className="overflow-y-auto flex-1 py-4 space-y-5 pr-1">
          {/* 점수 & 준비도 요약 배너 */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-600 block">종합 커리어 부합도</span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-slate-900">{cell.score}%</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                    cell.readiness === 'HIGH' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : cell.readiness === 'MEDIUM' 
                      ? 'bg-blue-50 text-blue-700 border-blue-200' 
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {cell.readiness === 'HIGH' ? '🟢 즉시 전환 유력' : cell.readiness === 'MEDIUM' ? '🔵 성장 유망 영역' : '🟠 단계적 빌드업'}
                  </span>
                </div>
              </div>

              {/* 직무/도메인 세부 부합도 */}
              <div className="flex space-x-3 text-right">
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-center min-w-[70px]">
                  <span className="text-[10px] text-slate-500 font-semibold block">직무 기본기</span>
                  <span className="text-sm font-bold text-indigo-600">{cell.roleScore}%</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-200 text-center min-w-[70px]">
                  <span className="text-[10px] text-slate-500 font-semibold block">도메인 특화</span>
                  <span className="text-sm font-bold text-indigo-600">{cell.domainScore}%</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200/60 pt-2.5">
              {cell.description}
            </p>
          </div>

          {/* 기술 매칭 현황 (이미 갖춘 기술 vs 추가 필요 기술) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 이미 갖춘 역량 */}
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-emerald-800 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>내가 이미 갖춘 강점 역량 ({cell.matchedSkills.length})</span>
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {cell.matchedSkills.map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-white text-emerald-800 text-[11px] font-semibold rounded-md border border-emerald-200 shadow-2xs">
                    ✓ {s}
                  </span>
                ))}
                {cell.matchedSkills.length === 0 && (
                  <span className="text-xs text-slate-400 italic">아직 매칭된 기술이 없습니다.</span>
                )}
              </div>
            </div>

            {/* 추가 필요 역량 */}
            <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-amber-800 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>추가 학습 추천 기술 ({cell.missingSkills.length})</span>
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {cell.missingSkills.map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-white text-amber-900 text-[11px] font-semibold rounded-md border border-amber-200 shadow-2xs">
                    + {s}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 전략적 조언 */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1">
            <span className="text-xs font-bold text-indigo-900 flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>전환 및 성장 전략 가이드</span>
            </span>
            <p className="text-xs text-indigo-950 leading-relaxed font-sans">
              {cell.actionGuide}
            </p>
          </div>

          {/* 실천 학습 로드맵 단계 */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-800">🎯 단계별 실천 학습 로드맵</h4>
            <div className="space-y-2">
              {cell.roadmapSteps.map((step, idx) => (
                <div key={idx} className="p-3 bg-white border border-slate-200 rounded-xl flex items-start space-x-3 shadow-2xs">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="text-xs text-slate-800 flex-1 leading-relaxed font-medium">
                    {step}
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 모달 푸터 */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
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
