import { useState, useMemo } from 'react';
import { 
  UserCircle2, 
  Sparkles, 
  Edit3, 
  Plus, 
  Search, 
  FolderPlus, 
  X, 
  Compass, 
  Info
} from 'lucide-react';
import type { Profile, Project } from '../../types';
import { db } from '../../db';
import { ProjectCard } from './ProjectCard';
import { ProjectModal } from './ProjectModal';
import { ProfileEditModal } from './ProfileEditModal';

interface ProfileViewProps {
  profile: Profile | null;
  projects: Project[];
  onDataRefresh: () => Promise<void>;
}

export function ProfileView({ profile, projects, onDataRefresh }: ProfileViewProps) {
  // 모달 상태
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  // 검색 및 태그 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 프로필 카드 인라인 기술 태그 빠른 추가 상태
  const [quickSkillInput, setQuickSkillInput] = useState('');

  // 1. 프로필 기본 정보 저장 핸들러
  const handleSaveProfile = async (updated: Profile) => {
    await db.profiles.put(updated);
    await onDataRefresh();
  };

  // 2. 인라인 빠른 기술 태그 추가
  const handleQuickAddSkill = async () => {
    if (!profile) return;
    const trimmed = quickSkillInput.trim().replace(/^,+|,+$/g, '');
    if (trimmed && !profile.skills.includes(trimmed)) {
      const updated: Profile = {
        ...profile,
        skills: [...profile.skills, trimmed],
        updatedAt: new Date().toISOString(),
      };
      await db.profiles.put(updated);
      setQuickSkillInput('');
      await onDataRefresh();
    }
  };

  const handleQuickSkillKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleQuickAddSkill();
    }
  };

  // 3. 인라인 기술 태그 삭제
  const handleQuickRemoveSkill = async (skillToRemove: string) => {
    if (!profile) return;
    const updated: Profile = {
      ...profile,
      skills: profile.skills.filter((s) => s !== skillToRemove),
      updatedAt: new Date().toISOString(),
    };
    await db.profiles.put(updated);
    await onDataRefresh();
  };

  // 4. 프로젝트 등록 및 수정 핸들러
  const handleSaveProject = async (
    projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>,
    editId?: string
  ) => {
    const now = new Date().toISOString();
    if (editId) {
      // 수정
      const existing = projects.find((p) => p.id === editId);
      const updated: Project = {
        ...projectData,
        id: editId,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await db.projects.put(updated);
    } else {
      // 신규 등록
      const newProject: Project = {
        ...projectData,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      await db.projects.add(newProject);
    }
    await onDataRefresh();
  };

  // 5. 프로젝트 삭제 핸들러
  const handleDeleteProject = async (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (window.confirm(`'${target?.title || '선택한 프로젝트'}'를 정말 삭제할까요?`)) {
      await db.projects.delete(projectId);
      await onDataRefresh();
    }
  };

  // 프로젝트 수정 모달 열기
  const handleOpenEditProject = (project: Project) => {
    setProjectToEdit(project);
    setIsProjectModalOpen(true);
  };

  // 프로젝트 신규 등록 모달 열기
  const handleOpenNewProject = () => {
    setProjectToEdit(null);
    setIsProjectModalOpen(true);
  };

  // 사용 중인 전체 기술 태그 목록 (필터 칩용)
  const allTechTags = useMemo(() => {
    const tagSet = new Set<string>();
    projects.forEach((p) => p.techStack?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet);
  }, [projects]);

  // 검색 및 필터링된 프로젝트 목록 (최신 시작일순 기본 정렬)
  const filteredProjects = useMemo(() => {
    return projects
      .filter((project) => {
        // 검색어 매칭 (제목, 역할, 설명, 기술태그, 성과)
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          project.title.toLowerCase().includes(q) ||
          project.role.toLowerCase().includes(q) ||
          project.description.toLowerCase().includes(q) ||
          project.techStack.some((t) => t.toLowerCase().includes(q)) ||
          project.outcomes.some((o) => o.toLowerCase().includes(q));

        // 태그 필터 매칭
        const matchesTag = !selectedTag || project.techStack.includes(selectedTag);

        return matchesQuery && matchesTag;
      })
      .sort((a, b) => {
        // 1. 현재 진행 중인 프로젝트를 최상단에 우선 배치
        if (a.period.isOngoing && !b.period.isOngoing) return -1;
        if (!a.period.isOngoing && b.period.isOngoing) return 1;

        // 2. 종료일 기준 비교 (진행 중이 아닌 경우 최근 종료일 우선)
        const endA = a.period.endDate || a.period.startDate;
        const endB = b.period.endDate || b.period.startDate;
        const endDiff = endB.localeCompare(endA);
        if (endDiff !== 0) return endDiff;

        // 3. 시작일 기준 내림차순 비교 (최근 시작한 프로젝트 우선)
        return b.period.startDate.localeCompare(a.period.startDate);
      });
  }, [projects, searchQuery, selectedTag]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* =========================================
          좌측 5열: 내 커리어 프로필 카드 (Sticky)
         ========================================= */}
      <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {/* 프로필 상단 요약 */}
          <div className="flex items-start justify-between pb-5 border-b border-slate-100">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl border border-indigo-100/80 shadow-sm">
                {profile?.name ? profile.name[0] : <UserCircle2 className="w-7 h-7" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  {profile?.name || '사용자'}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {profile?.title || '한 줄 소개를 등록해 주세요.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="기본 정보 수정"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>수정</span>
            </button>
          </div>

          <div className="py-5 space-y-5 text-xs">
            {/* 희망 직무 */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                희망 직무 (Target Role)
              </span>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{profile?.targetRole || '미설정'}</span>
              </div>
            </div>

            {/* 관심 도메인 */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                관심 산업 도메인 (Target Domains)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {profile?.targetDomains && profile.targetDomains.length > 0 ? (
                  profile.targetDomains.map((dom) => (
                    <span
                      key={dom}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-medium"
                    >
                      <Compass className="w-3 h-3 text-slate-400" />
                      <span>{dom}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">등록된 관심 도메인이 없습니다.</span>
                )}
              </div>
            </div>

            {/* 핵심 보유 기술 스택 (인터랙티브 태그 칩 & 인라인 추가) */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  보유 기술 스택 ({profile?.skills?.length || 0}개)
                </span>
                <span className="text-[11px] text-slate-400">Enter로 즉시 추가</span>
              </div>

              {/* 태그 리스트 */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {profile?.skills && profile.skills.length > 0 ? (
                  profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="group inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium transition-colors"
                    >
                      <span>{skill}</span>
                      <button
                        type="button"
                        onClick={() => handleQuickRemoveSkill(skill)}
                        className="text-slate-400 hover:text-rose-600 transition-colors"
                        title="태그 삭제"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">등록된 기술 스택이 없습니다.</span>
                )}
              </div>

              {/* 인라인 빠른 추가 인풋 */}
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  value={quickSkillInput}
                  onChange={(e) => setQuickSkillInput(e.target.value)}
                  onKeyDown={handleQuickSkillKeyDown}
                  placeholder="새 기술 입력 후 Enter (예: PyTorch)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
                />
                <button
                  type="button"
                  onClick={handleQuickAddSkill}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition-colors shrink-0 cursor-pointer"
                >
                  추가
                </button>
              </div>
            </div>
          </div>

          {/* 하단 안내 박스 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-slate-800 font-semibold text-xs">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              <span>지능형 매칭 엔진 연동 안내</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              등록된 모든 기술 스택과 프로젝트의 <strong>'성과 불릿'</strong>은 채용 공고(JD) 분석 시 <strong>'직접 증명 근거(Direct Evidence)'</strong>로 자동 대조됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================
          우측 8열: 프로젝트 성과 자산 관리
         ========================================= */}
      <div className="lg:col-span-8 space-y-6">
        {/* 상단 툴바: 검색, 태그 필터, 프로젝트 등록 버튼 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                프로젝트 자산 ({filteredProjects.length}건 / 총 {projects.length}건)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                정량적 성과와 구체적인 기여가 담긴 실전 프로젝트 경험 목록입니다.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenNewProject}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow transition-all shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>새 프로젝트 등록</span>
            </button>
          </div>

          {/* 검색창 */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트명, 역할, 사용 기술, 핵심 성과 키워드로 검색..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 기술 태그 필터 바 */}
          {allTechTags.length > 0 && (
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-400 font-medium shrink-0">태그 필터:</span>
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                  selectedTag === null
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                전체 ({projects.length})
              </button>
              {allTechTags.map((tag) => {
                const isSelected = selectedTag === tag;
                const count = projects.filter((p) => p.techStack?.includes(tag)).length;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    #{tag} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 프로젝트 리스트 렌더링 */}
        {filteredProjects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FolderPlus className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-bold text-slate-700">표시할 프로젝트가 없습니다</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedTag
                ? '검색 조건에 맞는 프로젝트가 없습니다. 검색어나 태그 필터를 초기화해 보세요.'
                : '아직 등록된 프로젝트가 없습니다. [새 프로젝트 등록] 버튼을 눌러 경험을 자산화해 보세요!'}
            </p>
            {searchQuery || selectedTag ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag(null);
                }}
                className="mt-4 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
              >
                필터 초기화
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenNewProject}
                className="mt-4 inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>첫 프로젝트 등록하기</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onEdit={handleOpenEditProject}
                onDelete={handleDeleteProject}
                onSelectTag={(tag) => setSelectedTag(tag === selectedTag ? null : tag)}
              />
            ))}
          </div>
        )}
      </div>

      {/* =========================================
          팝업 모달들
         ========================================= */}
      {/* 1. 프로필 기본 정보 수정 모달 */}
      {profile && (
        <ProfileEditModal
          isOpen={isProfileModalOpen}
          profile={profile}
          onClose={() => setIsProfileModalOpen(false)}
          onSave={handleSaveProfile}
        />
      )}

      {/* 2. 프로젝트 등록 및 수정 모달 */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        projectToEdit={projectToEdit}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProject}
      />
    </div>
  );
}
