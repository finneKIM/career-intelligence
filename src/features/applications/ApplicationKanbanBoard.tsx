import { 
  Building2, 
  Briefcase, 
  Calendar, 
  Lock, 
  Trash2, 
  Edit3, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import type { Application, ApplicationStatus } from '../../types';
import { STATUS_COLUMNS, STATUS_CONFIG } from './applicationHelper';
import { db } from '../../db';

interface ApplicationKanbanBoardProps {
  applications: Application[];
  onRefresh: () => void;
  onEdit: (app: Application) => void;
  onViewSnapshot: (app: Application) => void;
}

export function ApplicationKanbanBoard({
  applications,
  onRefresh,
  onEdit,
  onViewSnapshot,
}: ApplicationKanbanBoardProps) {
  // 상태 변경 헬퍼
  const handleStatusChange = async (appId: string, newStatus: ApplicationStatus) => {
    await db.applications.update(appId, {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
    onRefresh();
  };

  // 삭제 헬퍼
  const handleDelete = async (app: Application) => {
    if (window.confirm(`'${app.company} - ${app.role}' 지원 이력을 삭제할까요?\n(보존된 스냅샷도 함께 삭제됩니다)`)) {
      await db.applications.delete(app.id);
      onRefresh();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
      {STATUS_COLUMNS.map((colStatus) => {
        const config = STATUS_CONFIG[colStatus];
        const colApps = applications.filter((app) => app.status === colStatus);

        return (
          <div 
            key={colStatus} 
            className="bg-slate-100/70 rounded-2xl p-3 border border-slate-200/80 flex flex-col min-w-[240px]"
          >
            {/* 컬럼 헤더 */}
            <div className="flex items-center justify-between pb-3 px-1 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  colStatus === 'ACCEPTED' ? 'bg-emerald-500' :
                  colStatus === 'INTERVIEW' ? 'bg-indigo-500' :
                  colStatus === 'SUBMITTED' ? 'bg-blue-500' :
                  colStatus === 'REJECTED' ? 'bg-rose-500' : 'bg-slate-400'
                }`} />
                <h3 className="font-bold text-xs text-slate-800">{config.label}</h3>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                {colApps.length}
              </span>
            </div>

            {/* 카드 목록 */}
            <div className="space-y-3 pt-3 flex-1 overflow-y-auto max-h-[680px]">
              {colApps.map((app) => (
                <div
                  key={app.id}
                  className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all space-y-3"
                >
                  {/* 회사 및 직무 */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center space-x-1 font-bold text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                        <Building2 className="w-3 h-3" />
                        <span>{app.company}</span>
                      </span>
                      {app.snapshot?.analysisSnapshot && (
                        <span 
                          className="inline-flex items-center space-x-0.5 text-[10px] font-extrabold px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200"
                          title="당시 분석된 역량 충족도"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>{app.snapshot.analysisSnapshot.summaryScore}%</span>
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 tracking-tight flex items-center space-x-1">
                      <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{app.role}</span>
                    </h4>
                  </div>

                  {/* 지원일자 & 도메인 */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="inline-flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{app.appliedDate || '날짜 미지정'}</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">
                      {app.domain}
                    </span>
                  </div>

                  {/* 메모 미리보기 */}
                  {app.notes && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 line-clamp-2 leading-relaxed">
                      {app.notes}
                    </p>
                  )}

                  {/* 카드 하단 액션 */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => onViewSnapshot(app)}
                      className="inline-flex items-center space-x-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      title="지원 당시 공고 및 제출서류 스냅샷 확인"
                    >
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span>스냅샷</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>

                    <div className="flex items-center space-x-1">
                      {/* 상태 변경 퀵 드롭다운 */}
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                        className="text-[10px] font-semibold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 cursor-pointer"
                      >
                        {STATUS_COLUMNS.map((s) => (
                          <option key={s} value={s}>
                            ➔ {STATUS_CONFIG[s].label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => onEdit(app)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="지원 정보 수정"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(app)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="지원 이력 삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {colApps.length === 0 && (
                <div className="p-4 text-center text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  등록된 이력 없음
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
