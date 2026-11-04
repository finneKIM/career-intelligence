import { 
  Briefcase, 
  Layers, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import type { MatrixCell } from './explorerEngine';
import { TARGET_ROLES, TARGET_DOMAINS } from './explorerEngine';

interface RoleDomainMatrixProps {
  matrix: MatrixCell[];
  onSelectCell: (cell: MatrixCell) => void;
}

export function RoleDomainMatrix({ matrix, onSelectCell }: RoleDomainMatrixProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-sm text-slate-900 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>4×4 직무(Role) × 도메인(Domain) 교차 탐색 매트릭스</span>
          </h3>
          <p className="text-xs text-slate-500">
            각 셀을 클릭하면 내 보유 기술과의 상세 대조 분석과 단계별 실천 학습 로드맵을 확인할 수 있습니다.
          </p>
        </div>

        {/* 범례 */}
        <div className="hidden sm:flex items-center space-x-2 text-[11px]">
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>즉시 전환 유력 (HIGH)</span>
          </span>
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            <span>성장 유망 (MEDIUM)</span>
          </span>
          <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>단계적 빌드업 (GROWTH)</span>
          </span>
        </div>
      </div>

      {/* 4x4 매트릭스 테이블 / 그리드 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th className="p-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-50 rounded-tl-xl border border-slate-200 w-44">
                직무(Role) \ 도메인(Domain)
              </th>
              {TARGET_DOMAINS.map((domain) => (
                <th 
                  key={domain} 
                  className="p-3 text-center text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200"
                >
                  {domain}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TARGET_ROLES.map((role) => (
              <tr key={role} className="hover:bg-slate-50/50 transition-colors">
                {/* Y축 직무 헤더 */}
                <td className="p-3 bg-slate-50/70 border border-slate-200 font-bold text-xs text-slate-900">
                  <div className="flex items-center space-x-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{role}</span>
                  </div>
                </td>

                {/* X축 4개 도메인 셀들 */}
                {TARGET_DOMAINS.map((domain) => {
                  const cell = matrix.find((c) => c.role === role && c.domain === domain);
                  if (!cell) return <td key={domain} className="border border-slate-200" />;

                  const isHigh = cell.readiness === 'HIGH';
                  const isMedium = cell.readiness === 'MEDIUM';

                  return (
                    <td 
                      key={domain}
                      onClick={() => onSelectCell(cell)}
                      className={`p-3 border border-slate-200 transition-all cursor-pointer relative group ${
                        isHigh 
                          ? 'bg-emerald-50/40 hover:bg-emerald-100/60' 
                          : isMedium 
                          ? 'bg-blue-50/30 hover:bg-blue-100/50' 
                          : 'bg-white hover:bg-slate-100/60'
                      }`}
                    >
                      <div className="space-y-2">
                        {/* 상단 점수 & 뱃지 */}
                        <div className="flex items-center justify-between">
                          <span className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {cell.score}%
                          </span>
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border ${
                            isHigh 
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                              : isMedium 
                              ? 'bg-blue-100 text-blue-800 border-blue-300' 
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {cell.readiness}
                          </span>
                        </div>

                        {/* 매칭된 주요 기술 태그 칩 */}
                        <div className="flex flex-wrap gap-1 min-h-[20px]">
                          {cell.matchedSkills.slice(0, 2).map((s, i) => (
                            <span 
                              key={i} 
                              className="text-[9px] font-semibold px-1 py-0.2 bg-white text-slate-700 rounded border border-slate-200 truncate max-w-[80px]"
                            >
                              {s}
                            </span>
                          ))}
                          {cell.matchedSkills.length > 2 && (
                            <span className="text-[9px] text-slate-400 font-medium">
                              +{cell.matchedSkills.length - 2}
                            </span>
                          )}
                        </div>

                        {/* 상세 보기 링크 안내 */}
                        <div className="pt-1 flex items-center justify-end text-[10px] text-slate-400 group-hover:text-indigo-600 font-semibold transition-colors">
                          <Sparkles className="w-2.5 h-2.5 mr-0.5 opacity-0 group-hover:opacity-100" />
                          <span>로드맵</span>
                          <ChevronRight className="w-2.5 h-2.5" />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
