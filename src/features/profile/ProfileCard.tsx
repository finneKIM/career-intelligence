import { UserCircle, Target, Layers, Edit3, Lightbulb } from 'lucide-react';
import type { Profile } from '../../types';

interface ProfileCardProps {
  profile: Profile;
  projectCount: number;
  totalBulletsCount: number;
  onEdit: () => void;
}

export function ProfileCard({ profile, projectCount, totalBulletsCount, onEdit }: ProfileCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm sticky top-24 space-y-6">
      {/* 헤더 & 프로필 기본 정보 */}
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-100">
              <UserCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{profile.name}</h2>
              <p className="text-xs text-slate-500 line-clamp-1">{profile.title || '한 줄 소개를 등록해 주세요'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
            title="기본 프로필 수정"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {/* 내 자산 요약 통계 뱃지 2개 */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
            <div className="text-[11px] font-medium text-slate-400">보관된 프로젝트</div>
            <div className="text-base font-bold text-indigo-600 mt-0.5">{projectCount}건</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
            <div className="text-[11px] font-medium text-slate-400">증거 성과 불릿</div>
            <div className="text-base font-bold text-emerald-600 mt-0.5">{totalBulletsCount}개</div>
          </div>
        </div>
      </div>

      {/* 희망 직무 (Target Role) */}
      <div>
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 mb-2">
          <Target className="w-3.5 h-3.5 text-indigo-500" />
          <span>희망 직무 (Target Role)</span>
        </div>
        <div className="bg-indigo-50/60 border border-indigo-100/80 rounded-xl px-3.5 py-2 text-xs font-bold text-indigo-900">
          {profile.targetRole || '희망 직무 미설정'}
        </div>
      </div>

      {/* 관심 도메인 (Target Domains) */}
      <div>
        <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-500 mb-2">
          <Layers className="w-3.5 h-3.5 text-indigo-500" />
          <span>관심 도메인 & 산업</span>
        </div>
        {profile.targetDomains && profile.targetDomains.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.targetDomains.map((domain) => (
              <span
                key={domain}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200/60"
              >
                {domain}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">관심 도메인을 등록해 주세요.</p>
        )}
      </div>

      {/* 대표 보유 기술 스택 태그 */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
          <span>대표 기술 스택</span>
          <span className="text-[11px] font-normal text-slate-400">
            총 {profile.skills?.length || 0}개
          </span>
        </div>
        {profile.skills && profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <span
                key={skill}
                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-xs font-semibold border border-indigo-100"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">보유 기술 스택을 등록해 주세요.</p>
        )}
      </div>

      {/* 안내 박스 */}
      <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 flex items-start space-x-2">
        <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold block">로컬 퍼스트 자산 보관 원칙</span>
          <p className="text-amber-800 leading-relaxed text-[11px]">
            등록된 모든 성과 불릿과 기술 스택은 외부 서버에 전송되지 않고 내 브라우저(IndexedDB)에만 저장되며, 채용공고 분석 시 <strong>'직접 증명 근거'</strong>로 자동 활용됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
