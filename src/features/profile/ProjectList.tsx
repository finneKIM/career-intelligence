import { useState, useMemo } from 'react';
import { Search, Plus, Filter, FolderPlus, Sparkles } from 'lucide-react';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../../types';

interface ProjectListProps {
  projects: Project[];
  onAddNew: () => void;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onSeedSample: () => void;
}

export function ProjectList({
  projects,
  onAddNew,
  onEdit,
  onDelete,
  onSeedSample,
}: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 모든 프로젝트에서 사용된 고유 기술 태그 목록 추출
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach((p) => p.techStack.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [projects]);

  // 검색 및 태그 필터링
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // 1. 태그 필터
      if (selectedTag && !p.techStack.includes(selectedTag)) {
        return false;
      }
      // 2. 검색어 필터
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = p.title.toLowerCase().includes(q);
      const inRole = p.role.toLowerCase().includes(q);
      const inDesc = p.description.toLowerCase().includes(q);
      const inTech = p.techStack.some((t) => t.toLowerCase().includes(q));
      const inOutcomes = p.outcomes.some((o) => o.toLowerCase().includes(q));

      return inTitle || inRole || inDesc || inTech || inOutcomes;
    });
  }, [projects, searchQuery, selectedTag]);

  return (
    <div className="space-y-4">
      {/* 상단 컨트롤 바: 검색창, 태그 필터, 등록 버튼 */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* 검색 인풋 */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="프로젝트명, 역할, 기술, 성과 불릿 검색..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-slate-50/50"
          />
        </div>

        {/* 액션 버튼 그룹 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={onAddNew}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-200 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>새 프로젝트 등록</span>
          </button>
        </div>
      </div>

      {/* 태그 필터 칩 목록 (등록된 태그가 있을 때) */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1 shrink-0 pl-1">
            <Filter className="w-3 h-3" />
            <span>기술 필터:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              selectedTag === null
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            전체 ({projects.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
                selectedTag === tag
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 프로젝트 카드 목록 */}
      {filteredProjects.length > 0 ? (
        <div className="space-y-4">
          <div className="text-xs text-slate-400 px-1">
            총 <strong>{filteredProjects.length}</strong>개의 프로젝트 자산이 표시됩니다.
          </div>
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ) : projects.length === 0 ? (
        /* 프로젝트가 아예 0건일 때의 Empty State */
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <FolderPlus className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">아직 등록된 프로젝트가 없습니다</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
            내가 수행한 프로젝트 경험과 정량적 성과(불릿)를 등록해 보세요.
            채용공고 분석 시 내 경험이 확실한 합격 근거로 매칭됩니다!
          </p>
          <div className="mt-6 flex items-center justify-center space-x-2">
            <button
              type="button"
              onClick={onAddNew}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-indigo-200 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>직접 프로젝트 등록</span>
            </button>
            <button
              type="button"
              onClick={onSeedSample}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>샘플 2건 불러오기</span>
            </button>
          </div>
        </div>
      ) : (
        /* 검색 결과가 없을 때 */
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-xs text-slate-500">
            검색 조건에 맞는 프로젝트를 찾지 못했습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTag(null);
            }}
            className="mt-3 text-xs text-indigo-600 hover:underline font-medium cursor-pointer"
          >
            검색 필터 초기화
          </button>
        </div>
      )}
    </div>
  );
}
