import { useState, useEffect } from 'react';
import { AiPolishButton } from '../ai';
import { X, Plus, Trash2, FolderPlus, Link as LinkIcon, Sparkles } from 'lucide-react';
import type { Project, ProjectLink } from '../../types';

interface ProjectModalProps {
  isOpen: boolean;
  projectToEdit?: Project | null;
  onClose: () => void;
  onSave: (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>, editId?: string) => Promise<void>;
}

export function ProjectModal({ isOpen, projectToEdit, onClose, onSave }: ProjectModalProps) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isOngoing, setIsOngoing] = useState(false);
  const [role, setRole] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [description, setDescription] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>(['']);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 모달이 열리거나 수정 대상이 변경될 때 폼 초기화
  useEffect(() => {
    if (projectToEdit) {
      setTitle(projectToEdit.title);
      setStartDate(projectToEdit.period.startDate);
      setEndDate(projectToEdit.period.endDate || '');
      setIsOngoing(projectToEdit.period.isOngoing);
      setRole(projectToEdit.role);
      setTechStack(projectToEdit.techStack || []);
      setDescription(projectToEdit.description);
      setOutcomes(projectToEdit.outcomes.length > 0 ? projectToEdit.outcomes : ['']);
      setLinks(projectToEdit.links || []);
    } else {
      setTitle('');
      setStartDate('');
      setEndDate('');
      setIsOngoing(false);
      setRole('');
      setTechStack([]);
      setTechInput('');
      setDescription('');
      setOutcomes(['']);
      setLinks([]);
    }
  }, [projectToEdit, isOpen]);

  if (!isOpen) return null;

  // 기술 스택 태그 추가 (쉼표 또는 Enter)
  const handleAddTech = () => {
    const trimmed = techInput.trim().replace(/^,+|,+$/g, '');
    if (trimmed && !techStack.includes(trimmed)) {
      setTechStack([...techStack, trimmed]);
      setTechInput('');
    }
  };

  const handleTechKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTech();
    }
  };

  const handleRemoveTech = (techToRemove: string) => {
    setTechStack(techStack.filter((t) => t !== techToRemove));
  };

  // 성과 불릿(outcomes) 관리
  const handleOutcomeChange = (index: number, value: string) => {
    const next = [...outcomes];
    next[index] = value;
    setOutcomes(next);
  };

  const handleAddOutcomeRow = () => {
    setOutcomes([...outcomes, '']);
  };

  const handleRemoveOutcomeRow = (index: number) => {
    if (outcomes.length === 1) {
      setOutcomes(['']);
      return;
    }
    setOutcomes(outcomes.filter((_, i) => i !== index));
  };

  // 링크 관리
  const handleAddLinkRow = () => {
    setLinks([...links, { title: '', url: '' }]);
  };

  const handleLinkChange = (index: number, field: 'title' | 'url', value: string) => {
    const next = [...links];
    next[index] = { ...next[index], [field]: value };
    setLinks(next);
  };

  const handleRemoveLinkRow = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  // 제출 처리
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return alert('프로젝트명을 입력해 주세요.');
    if (!startDate.trim()) return alert('시작 년월을 선택해 주세요.');
    if (!role.trim()) return alert('담당 역할을 입력해 주세요.');

    const cleanOutcomes = outcomes.map((o) => o.trim()).filter(Boolean);
    if (cleanOutcomes.length === 0) {
      return alert('최소 1개 이상의 핵심 성과(불릿)를 입력해 주세요. (JD 매칭 증거 데이터로 사용됩니다)');
    }

    const cleanLinks = links.filter((l) => l.title.trim() && l.url.trim());

    setIsSubmitting(true);
    try {
      await onSave(
        {
          title: title.trim(),
          period: {
            startDate,
            endDate: isOngoing ? undefined : endDate || undefined,
            isOngoing,
          },
          role: role.trim(),
          techStack,
          description: description.trim(),
          outcomes: cleanOutcomes,
          links: cleanLinks,
        },
        projectToEdit?.id
      );
      onClose();
    } catch (err) {
      console.error('프로젝트 저장 실패:', err);
      alert('프로젝트 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {projectToEdit ? '프로젝트 자산 수정' : '새 프로젝트 자산 등록'}
              </h3>
              <p className="text-xs text-slate-500">
                작성된 성과 불릿과 기술 스택은 채용공고(JD) 매칭 엔진의 직접 증거(Evidence)로 활용됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 본문 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-sm">
          {/* 1. 프로젝트명 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              프로젝트명 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 실시간 멀티모달 음성 합성 모델 서빙 파이프라인 개발"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          {/* 2. 기간 & 진행 여부 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                시작 년월 <span className="text-rose-500">*</span>
              </label>
              <input
                type="month"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">종료 년월</label>
                <label className="flex items-center space-x-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOngoing}
                    onChange={(e) => setIsOngoing(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className="text-xs text-indigo-600 font-medium">현재 진행 중</span>
                </label>
              </div>
              <input
                type="month"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isOngoing}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 3. 담당 역할 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              담당 역할 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="예: 딥러닝 모델 경량화 및 프로덕션 추론 API 서빙 전담 (기여도 70%)"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              required
            />
          </div>

          {/* 4. 사용 기술 스택 (태그 칩) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              사용 기술 스택 <span className="text-slate-400 font-normal">(Enter 또는 쉼표로 추가)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {techStack.map((tech) => (
                <span
                  key={tech}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium"
                >
                  <span>{tech}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTech(tech)}
                    className="hover:text-indigo-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={handleTechKeyDown}
                placeholder="예: PyTorch, FastAPI, Docker, ONNX"
                className="flex-1 px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs"
              />
              <button
                type="button"
                onClick={handleAddTech}
                className="px-3 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-medium text-xs transition-colors shrink-0"
              >
                추가
              </button>
            </div>
          </div>

          {/* 5. 프로젝트 개요 (한 줄 설명) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">프로젝트 개요</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="프로젝트의 목적과 전반적인 배경을 간략히 적어주세요."
              className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs resize-none"
            />
          </div>

          {/* 6. 핵심 성과 불릿 (Evidence Bullets) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <label className="text-xs font-bold text-slate-800">
                    🎯 핵심 성과 불릿 (Evidence Bullets) <span className="text-rose-500">*</span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  단순 나열보다 <strong>정량적 수치(% 개선, ms 단축)</strong>와 <strong>구체적 역할</strong>을 작성하면 JD 매칭 시 높은 점수를 받습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddOutcomeRow}
                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>항목 추가</span>
              </button>
            </div>

            <div className="space-y-2">
              {outcomes.map((outcome, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-xs font-semibold text-slate-400 mt-2 shrink-0 w-4 text-right">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={outcome}
                    onChange={(e) => handleOutcomeChange(idx, e.target.value)}
                    placeholder="예: ONNX Runtime 양자화로 추론 지연시간 35% 단축 (120ms ➔ 78ms)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <AiPolishButton text={outcome} onPick={(t) => handleOutcomeChange(idx, t)} />
                  <button
                    type="button"
                    onClick={() => handleRemoveOutcomeRow(idx)}
                    title="항목 삭제"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 7. 관련 링크 (선택사항) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <LinkIcon className="w-3 h-3 text-slate-500" />
                <span>참고 링크 (GitHub, 데모, 블로그 등 선택)</span>
              </label>
              <button
                type="button"
                onClick={handleAddLinkRow}
                className="text-xs text-indigo-600 hover:underline flex items-center space-x-1 font-medium"
              >
                <Plus className="w-3 h-3" />
                <span>링크 추가</span>
              </button>
            </div>

            {links.map((link, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={link.title}
                  onChange={(e) => handleLinkChange(idx, 'title', e.target.value)}
                  placeholder="링크 이름 (예: GitHub)"
                  className="w-1/3 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => handleLinkChange(idx, 'url', e.target.value)}
                  placeholder="URL (https://...)"
                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveLinkRow(idx)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* 모달 하단 액션 버튼 */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {isSubmitting ? '저장 중...' : projectToEdit ? '변경사항 저장' : '프로젝트 등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
