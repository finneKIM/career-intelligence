import { useState, useEffect } from 'react';
import { 
  Plus, 
  KanbanSquare, 
  Search, 
  Sparkles, 
  ClipboardList
} from 'lucide-react';
import type { Application } from '../../types';
import { db } from '../../db';
import { ApplicationKanbanBoard } from './ApplicationKanbanBoard';
import { ApplicationModal } from './ApplicationModal';
import { ApplicationSnapshotModal } from './ApplicationSnapshotModal';
import { seedSampleApplicationsIfEmpty, STATUS_CONFIG } from './applicationHelper';

export function ApplicationTrackerView() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('ALL');

  // 모달 상태
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [snapshotApp, setSnapshotApp] = useState<Application | null>(null);

  // 데이터 로드
  const loadApplications = async () => {
    try {
      setLoading(true);
      const list = await db.applications.reverse().sortBy('updatedAt');
      setApplications(list);
    } catch (err) {
      console.error('지원 이력 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // 샘플 데이터 시딩
  const handleSeedSamples = async () => {
    await seedSampleApplicationsIfEmpty();
    await loadApplications();
  };

  // 필터링된 지원 이력
  const filteredApps = applications.filter((app) => {
    const q = searchQuery.toLowerCase();
    const matchQuery = 
      app.company.toLowerCase().includes(q) ||
      app.role.toLowerCase().includes(q) ||
      (app.notes && app.notes.toLowerCase().includes(q));

    const matchDomain = selectedDomain === 'ALL' || app.domain === selectedDomain;

    return matchQuery && matchDomain;
  });

  // 상태별 카운트 계산
  const counts = {
    READY: applications.filter(a => a.status === 'READY').length,
    SUBMITTED: applications.filter(a => a.status === 'SUBMITTED').length,
    INTERVIEW: applications.filter(a => a.status === 'INTERVIEW').length,
    ACCEPTED: applications.filter(a => a.status === 'ACCEPTED').length,
    REJECTED: applications.filter(a => a.status === 'REJECTED').length,
  };

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 & 글로벌 통계 배너 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <KanbanSquare className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                지원 이력 트래커 & 불변 스냅샷 보존
              </h2>
              <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-100">
                총 {applications.length}건
              </span>
            </div>
            <p className="text-xs text-slate-500">
              지원 상태를 5단계 칸반으로 추적하며, 지원 당시 제출한 공고 원문과 자소서, 분석 결과를 변경 불가능한 스냅샷으로 영구 보존합니다.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            {applications.length === 0 && (
              <button
                type="button"
                onClick={handleSeedSamples}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>샘플 지원 이력 불러오기</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingApp(null);
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ 새 지원 이력 등록</span>
            </button>
          </div>
        </div>

        {/* 5단계 파이프라인 통계 바 */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3 border-t border-slate-100">
          {(['READY', 'SUBMITTED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'] as const).map((st) => {
            const conf = STATUS_CONFIG[st];
            return (
              <div key={st} className={`p-2.5 rounded-xl border ${conf.badgeBg} ${conf.badgeBorder} text-center`}>
                <span className={`text-[11px] font-bold ${conf.badgeText} block`}>{conf.label}</span>
                <span className="text-lg font-black text-slate-900">{counts[st]}건</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. 검색 및 도메인 필터 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="지원 회사명, 직무명, 메모 검색..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 shadow-2xs"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500"
          >
            <option value="ALL">전체 산업 도메인</option>
            <option value="소리 & 오디오">소리 & 오디오</option>
            <option value="미디어 & 생성형 AI">미디어 & 생성형 AI</option>
            <option value="로보틱스 & 자율주행">로보틱스 & 자율주행</option>
            <option value="헬스케어 & 바이오">헬스케어 & 바이오</option>
            <option value="일반 IT / 핀테크">일반 IT / 핀테크</option>
          </select>
        </div>
      </div>

      {/* 3. 칸반 보드 영역 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          지원 이력을 불러오는 중입니다...
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ClipboardList className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">아직 등록된 지원 이력이 없습니다.</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              지원한 회사의 채용 공고와 제출 서류를 등록하여 5단계 파이프라인으로 체계적으로 관리해보세요.
            </p>
          </div>
          <div className="flex items-center justify-center space-x-3">
            <button
              type="button"
              onClick={handleSeedSamples}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              샘플 데이터 시딩
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingApp(null);
                setIsAddModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
            >
              + 첫 지원 이력 등록
            </button>
          </div>
        </div>
      ) : (
        <ApplicationKanbanBoard
          applications={filteredApps}
          onRefresh={loadApplications}
          onEdit={(app) => {
            setEditingApp(app);
            setIsAddModalOpen(true);
          }}
          onViewSnapshot={(app) => setSnapshotApp(app)}
        />
      )}

      {/* 4. 등록/수정 모달 */}
      <ApplicationModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingApp(null);
        }}
        onSuccess={loadApplications}
        applicationToEdit={editingApp}
      />

      {/* 5. 불변 스냅샷 열람 모달 */}
      <ApplicationSnapshotModal
        isOpen={Boolean(snapshotApp)}
        onClose={() => setSnapshotApp(null)}
        application={snapshotApp}
      />
    </div>
  );
}
