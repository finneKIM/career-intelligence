import { Calendar, Briefcase, Sparkles, ExternalLink, Edit2, Trash2 } from 'lucide-react';
import type { Project } from '../../types';

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (projectId: string) => void;
  onSelectTag?: (tag: string) => void;
}

export function ProjectCard({ project, onEdit, onDelete, onSelectTag }: ProjectCardProps) {
  // 수행 기간 포맷 계산 (예: 2024.01 ~ 2024.06 (6개월))
  const formatPeriod = () => {
    const { startDate, endDate, isOngoing } = project.period;
    if (isOngoing) {
      return `${startDate} ~ 현재 진행 중`;
    }
    return `${startDate} ~ ${endDate || '종료'}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4">
      {/* 1. 상단: 제목, 기간, 역할 및 제어 버튼 */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 flex-1">
            <h4 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
              {project.title}
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center space-x-1 text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatPeriod()}</span>
              </span>
              <span className="inline-flex items-center space-x-1 text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full font-medium">
                <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
                <span>{project.role}</span>
              </span>
            </div>
          </div>

          {/* 수정 / 삭제 액션 */}
          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(project)}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              title="프로젝트 수정"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(project.id)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="프로젝트 삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. 프로젝트 개요 (한 줄 설명) */}
        {project.description && (
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            {project.description}
          </p>
        )}
      </div>

      {/* 3. 사용 기술 스택 태그 */}
      {project.techStack && project.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {project.techStack.map((tech) => (
            <button
              key={tech}
              type="button"
              onClick={() => onSelectTag?.(tech)}
              className="px-2.5 py-0.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200/80 hover:border-indigo-200 rounded-md text-xs font-medium transition-colors"
              title={`'${tech}' 태그로 필터링`}
            >
              {tech}
            </button>
          ))}
        </div>
      )}

      {/* 4. 🎯 핵심 성과 불릿 (Evidence Bullets) */}
      {project.outcomes && project.outcomes.length > 0 && (
        <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>🎯 핵심 성과 (Evidence Bullets)</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {project.outcomes.map((bullet, idx) => (
              <li key={idx} className="flex items-start space-x-2 leading-relaxed">
                <span className="text-indigo-500 font-bold shrink-0 mt-0.5">•</span>
                <span className="flex-1">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. 관련 링크 */}
      {project.links && project.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
          {project.links.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg transition-colors font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              <span>{link.title}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
