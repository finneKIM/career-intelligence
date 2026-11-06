import { useState } from 'react';
import { X, Plus, Sparkles } from 'lucide-react';
import type { Profile } from '../../types';
import { redactDeep, rulesFromProfile } from '../../utils/piiRedaction';

interface ProfileEditModalProps {
  isOpen: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (updated: Profile) => Promise<void>;
}

export function ProfileEditModal({ isOpen, profile, onClose, onSave }: ProfileEditModalProps) {
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title);
  const [targetRole, setTargetRole] = useState(profile.targetRole);
  const [targetDomains, setTargetDomains] = useState<string[]>(profile.targetDomains || []);
  const [domainInput, setDomainInput] = useState('');
  const [skills, setSkills] = useState<string[]>(profile.skills || []);
  const [skillInput, setSkillInput] = useState('');
  const [email, setEmail] = useState(profile.email ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [address, setAddress] = useState(profile.address ?? '');
  const [termsText, setTermsText] = useState((profile.redactTerms ?? []).join(', '));
  const [sample, setSample] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const parseTerms = () => termsText.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  // 가림 시험(미리보기): AI 호출 없이 브라우저 안에서만 계산한다
  const preview = (() => {
    if (!sample.trim()) return null;
    try {
      const rules = rulesFromProfile({ name, email, phone, address, redactTerms: parseTerms() });
      const r = redactDeep(sample, rules);
      return { text: r.value, count: r.count };
    } catch {
      return { text: '가림 검사를 통과하지 못했습니다. 입력을 확인해 주세요.', count: 0 };
    }
  })();

  // 관심 도메인 태그 추가
  const handleAddDomain = () => {
    const trimmed = domainInput.trim();
    if (trimmed && !targetDomains.includes(trimmed)) {
      setTargetDomains([...targetDomains, trimmed]);
      setDomainInput('');
    }
  };

  const handleRemoveDomain = (domainToRemove: string) => {
    setTargetDomains(targetDomains.filter((d) => d !== domainToRemove));
  };

  // 기술 스택 태그 추가
  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert('이름을 입력해 주세요.');

    setIsSubmitting(true);
    try {
      const updated: Profile = {
        ...profile,
        name: name.trim(),
        title: title.trim(),
        targetRole: targetRole.trim(),
        targetDomains,
        skills,
        email: email.trim(),
        phone: phone.trim(),
        address: address.trim(),
        redactTerms: parseTerms(),
        updatedAt: new Date().toISOString(),
      };
      await onSave(updated);
      onClose();
    } catch (err) {
      console.error('프로필 저장 실패:', err);
      alert('프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 모달 헤더 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900">프로필 기본정보 수정</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 폼 본문 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              이름 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 이지은"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              한 줄 소개 / 현재 직무
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 데이터 중심 실전형 AI 엔지니어"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              희망 직무 (Target Role)
            </label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="예: AI Applied Engineer, MLOps Engineer"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* 관심 도메인 태그 입력 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              관심 도메인 & 산업 분야
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddDomain();
                  }
                }}
                placeholder="예: 소리 & 오디오, 미디어 & 생성형 AI (입력 후 추가)"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs"
              />
              <button
                type="button"
                onClick={handleAddDomain}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors inline-flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>추가</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-7">
              {targetDomains.map((domain) => (
                <span
                  key={domain}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-medium"
                >
                  <span>{domain}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDomain(domain)}
                    className="hover:text-indigo-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* 대표 보유 기술 스택 태그 입력 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              대표 보유 기술 스택 (기술 태그)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="예: PyTorch, Docker, React, FastAPI (입력 후 Enter)"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors inline-flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>추가</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-7">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-medium"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="hover:text-slate-900 text-slate-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>


          {/* 연락처·가림 규칙: AI 전송 전 가리는 용도 */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div>
              <p className="text-xs font-bold text-amber-900">AI 전송 시 가릴 개인정보</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                여기 적은 값은 AI에 보내지 않고, 보낼 문장에 들어 있으면 {'{이름A}'} 같은 표시로 바꿔 보냅니다. 백업 파일에는 포함됩니다.
                이메일·전화번호·주민등록번호 형태는 등록하지 않아도 항상 가립니다.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">이메일</label>
                <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="예: me@example.com" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">전화번호</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="예: 010-0000-0000" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">주소</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 서울시 OO구 OO로 1" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">추가로 가릴 단어 (쉼표로 구분)</label>
              <input type="text" value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="예: OO대학교, 이전 회사명, 영문 이름 표기" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600" />
              <p className="text-[10px] text-slate-500 mt-1">학교·회사명 같은 간접 정보는 자동으로 못 가리므로 여기에 적어 주세요. 너무 흔한 단어는 문장 속 일반 단어까지 가려질 수 있습니다.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">가림 시험 (AI 호출 없음)</label>
              <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={2} placeholder="샘플 문장을 넣어 어떻게 가려지는지 확인하세요" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-xs" />
              {preview && (
                <p className="mt-1 text-[11px] text-slate-700 bg-white border border-slate-200 rounded-lg p-2 break-words">
                  <span className="font-semibold">{preview.count}건 가림 → </span>
                  {preview.text}
                </p>
              )}
            </div>
          </div>

          {/* 모달 액션 버튼 */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm shadow-indigo-200 transition-colors"
            >
              {isSubmitting ? '저장 중...' : '프로필 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
