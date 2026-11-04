import { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Briefcase, 
  Calendar, 
  FileText, 
  Link, 
  Sparkles,
  ClipboardList,
  Tag
} from 'lucide-react';
import type { Application, ApplicationStatus, JobDescription } from '../../types';
import { db, getOrCreateDefaultProfile } from '../../db';
import { analyzeJobDescriptionMatch } from '../matching';
import { STATUS_CONFIG } from './applicationHelper';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  applicationToEdit?: Application | null;
}

export function ApplicationModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  applicationToEdit 
}: ApplicationModalProps) {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [domain, setDomain] = useState('소리 & 오디오');
  const [status, setStatus] = useState<ApplicationStatus>('SUBMITTED');
  const [appliedDate, setAppliedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');

  // 채용 공고 선택용
  const [availableJds, setAvailableJds] = useState<JobDescription[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // 공고 목록 로드
    db.jobDescriptions.toArray().then((jds) => {
      setAvailableJds(jds);
      if (jds.length > 0 && !applicationToEdit && !selectedJdId) {
        setSelectedJdId(jds[0].id);
        setCompany(jds[0].company);
        setRole(jds[0].role);
        setDomain(jds[0].domain);
      }
    });

    if (applicationToEdit) {
      setCompany(applicationToEdit.company);
      setRole(applicationToEdit.role);
      setDomain(applicationToEdit.domain);
      setStatus(applicationToEdit.status);
      setAppliedDate(applicationToEdit.appliedDate || '');
      setNotes(applicationToEdit.notes || '');
      setResumeText(applicationToEdit.snapshot.resumeText || '');
      setPortfolioUrl(applicationToEdit.snapshot.portfolioUrl || '');
    } else {
      // 초기화
      setCompany('');
      setRole('');
      setDomain('소리 & 오디오');
      setStatus('SUBMITTED');
      setAppliedDate(new Date().toISOString().split('T')[0]);
      setNotes('');
      setResumeText('');
      setPortfolioUrl('');
    }
  }, [isOpen, applicationToEdit]);

  if (!isOpen) return null;

  // 공고 선택 시 필드 자동 채움
  const handleSelectJd = (jdId: string) => {
    setSelectedJdId(jdId);
    const found = availableJds.find(j => j.id === jdId);
    if (found) {
      setCompany(found.company);
      setRole(found.role);
      setDomain(found.domain);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) {
      alert('회사명과 지원 직무를 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();

      if (applicationToEdit) {
        // 기존 지원 정보 업데이트 (상태, 메모, 날짜 등)
        await db.applications.update(applicationToEdit.id, {
          company: company.trim(),
          role: role.trim(),
          domain: domain.trim(),
          status,
          appliedDate: appliedDate || undefined,
          notes: notes.trim() || undefined,
          updatedAt: now,
        });
      } else {
        // 신규 지원 등록: 당시 공고 및 매칭 분석 스냅샷 생성
        let targetJd = availableJds.find(j => j.id === selectedJdId);

        // 만약 공고가 없으면 임시 스냅샷용 공고 객체 생성
        if (!targetJd) {
          targetJd = {
            id: `jd-snap-${Date.now()}`,
            company: company.trim(),
            role: role.trim(),
            domain: domain.trim(),
            rawText: `${company} - ${role} 공고 원문 직접 등록`,
            sections: {
              responsibilities: ['해당 직무 주요 업무 수행'],
              qualifications: ['관련 실무 개발 경험'],
              preferred: ['유관 프로젝트 수행 경험자'],
            },
            parsedAt: now,
          };
        }

        // 현재 사용자 프로필 및 프로젝트 로드하여 스냅샷용 매칭 분석 실행
        const profile = await getOrCreateDefaultProfile();
        const projects = await db.projects.toArray();
        const analysisSnapshot = analyzeJobDescriptionMatch(targetJd, projects, profile);

        const newApplication: Application = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `app-${Date.now()}`,
          company: company.trim(),
          role: role.trim(),
          domain: domain.trim(),
          status,
          appliedDate: appliedDate || undefined,
          notes: notes.trim() || undefined,
          snapshot: {
            jdSnapshot: targetJd,
            resumeText: resumeText.trim(),
            portfolioUrl: portfolioUrl.trim() || undefined,
            analysisSnapshot,
            snapshotTimestamp: now,
          },
          createdAt: now,
          updatedAt: now,
        };

        await db.applications.add(newApplication);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('지원 이력 저장 실패:', err);
      alert('지원 이력을 저장하는 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {applicationToEdit ? '지원 이력 수정' : '새 지원 이력 & 불변 스냅샷 등록'}
              </h2>
              <p className="text-xs text-slate-500">
                지원 당시의 제출 서류와 분석 결과를 스냅샷으로 영구 보존합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 바디 */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 py-4 space-y-4 pr-1">
          {/* 기존 등록된 공고 불러오기 선택 */}
          {!applicationToEdit && availableJds.length > 0 && (
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5">
              <label className="block text-xs font-bold text-indigo-950 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>등록된 채용공고(JD)와 연결하여 스냅샷 생성</span>
              </label>
              <select
                value={selectedJdId}
                onChange={(e) => handleSelectJd(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-indigo-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
              >
                {availableJds.map(jd => (
                  <option key={jd.id} value={jd.id}>
                    [{jd.company}] {jd.role} ({jd.domain})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 기본 정보 (회사명, 직무, 도메인) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>지원 회사명 *</span>
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="예: 예시클라우드"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>지원 직무 *</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: AI Applied Engineer"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>산업 도메인</span>
              </label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white"
              >
                <option value="소리 & 오디오">소리 & 오디오</option>
                <option value="미디어 & 생성형 AI">미디어 & 생성형 AI</option>
                <option value="로보틱스 & 자율주행">로보틱스 & 자율주행</option>
                <option value="헬스케어 & 바이오">헬스케어 & 바이오</option>
                <option value="일반 IT / 핀테크">일반 IT / 핀테크</option>
              </select>
            </div>
          </div>

          {/* 상태 및 지원일자 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">지원 상태 (파이프라인)</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white font-semibold"
              >
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>지원 일자</span>
              </label>
              <input
                type="date"
                value={appliedDate}
                onChange={(e) => setAppliedDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 bg-white"
              />
            </div>
          </div>

          {/* 제출 서류 (신규 등록 시 스냅샷에 보존) */}
          {!applicationToEdit && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>당시 제출한 자기소개서 / 지원서 내용 (스냅샷 영구 보존)</span>
                </label>
                <textarea
                  rows={4}
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="당시 제출한 자기소개서 문안이나 핵심 지원 동기를 붙여넣으세요..."
                  className="w-full p-3 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 leading-relaxed font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center space-x-1">
                  <Link className="w-3.5 h-3.5 text-slate-400" />
                  <span>제출한 포트폴리오 링크 (선택)</span>
                </label>
                <input
                  type="url"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </>
          )}

          {/* 진행 메모 */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">진행 메모 / 회고</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="전형 진행 상황, 면접 질문, 준비할 점 등 자유롭게 기록..."
              className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* 버튼 */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? '저장 중...' : applicationToEdit ? '수정 완료' : '지원 이력 & 스냅샷 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
