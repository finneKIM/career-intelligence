import { useState, useEffect } from 'react';
import { 
  Plus, 
  FileSearch, 
  Search, 
  Sparkles,
  ClipboardList
} from 'lucide-react';
import type { JobDescription } from '../../types';
import { db } from '../../db';
import { JdInputModal } from './JdInputModal';
import { JdDetailCard } from './JdDetailCard';

interface JdAnalysisViewProps {
  onNavigateToMatching?: (jdId: string) => void;
}

export function JdAnalysisView({ onNavigateToMatching: _ }: JdAnalysisViewProps) {
  const [jds, setJds] = useState<JobDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);

  // 로컬 IndexedDB에서 저장된 채용공고 목록 로드
  const loadJds = async () => {
    try {
      setLoading(true);
      const list = await db.jobDescriptions.reverse().sortBy('parsedAt');
      setJds(list);
    } catch (err) {
      console.error('채용 공고 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJds();
  }, []);

  // 검색 필터링
  const filteredJds = jds.filter(jd => {
    const q = searchQuery.toLowerCase();
    return (
      jd.company.toLowerCase().includes(q) ||
      jd.role.toLowerCase().includes(q) ||
      jd.domain.toLowerCase().includes(q) ||
      jd.sections.responsibilities.some(r => r.toLowerCase().includes(q)) ||
      jd.sections.qualifications.some(k => k.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 & 컨트롤 바 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <FileSearch className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              채용공고(JD) 파서 & 구조화
            </h2>
            <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-100">
              총 {jds.length}건
            </span>
          </div>
          <p className="text-xs text-slate-500">
            채용 공고의 원문을 손상 없이 보존하고, [주요 업무], [자격 요건], [우대 사항]으로 자동 정제하여 역량 분석의 기반을 마련합니다.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsInputModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ 새 공고 파싱 & 등록</span>
          </button>
        </div>
      </div>

      {/* 2. 검색 및 필터 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="기업명, 직무명, 요구 기술 검색..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
          />
        </div>

        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs text-slate-500 hover:text-slate-800 underline self-start sm:self-auto cursor-pointer"
          >
            검색 필터 초기화
          </button>
        )}
      </div>

      {/* 3. 공고 목록 카드 그리드 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          저장된 채용 공고를 로딩하는 중입니다...
        </div>
      ) : filteredJds.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery ? '검색 결과와 일치하는 공고가 없습니다.' : '아직 등록된 채용 공고가 없습니다.'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              관심 있는 기업의 채용 공고를 붙여넣어 주요 업무와 자격 요건을 자동으로 정제해 보세요.
            </p>
          </div>
          {!searchQuery && (
            <button
              type="button"
              onClick={() => setIsInputModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>첫 채용 공고 등록하기 (샘플 지원)</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredJds.map(jd => (
            <JdDetailCard
              key={jd.id}
              jd={jd}
              onUpdate={loadJds}
              onDelete={loadJds}
            />
          ))}
        </div>
      )}

      {/* 4. 공고 입력 & 파싱 모달 */}
      <JdInputModal
        isOpen={isInputModalOpen}
        onClose={() => setIsInputModalOpen(false)}
        onSuccess={() => {
          loadJds();
        }}
      />
    </div>
  );
}
