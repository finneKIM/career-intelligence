import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  LayoutDashboard, 
  UserCircle2, 
  FileSearch, 
  KanbanSquare, 
  Compass, 
  Settings as SettingsIcon,
  Database,
  RefreshCw,
  ArrowRight,
  FilePenLine
} from 'lucide-react';
import { db, getOrCreateDefaultProfile, seedSampleProjectsIfEmpty } from './db';
import type { Profile, Project } from './types';
import { ProfileView } from './features/profile/ProfileView';
import { JdAnalysisView } from './features/jd-analysis';
import { ApplicationTrackerView } from './features/applications';
import { CareerExplorerView } from './features/explorer';
import { BackupPanel } from './features/backup';
import { NotionAdapterPanel } from './features/notion';
import { AiSettingsPanel } from './features/ai';
import { DocumentsView } from './features/documents/DocumentsView';
import { AccountPanel, UploadConfirm } from './features/account/AccountPanel';
import { useAccount } from './features/account/AccountContext';

export type TabType = 'dashboard' | 'profile' | 'jd' | 'tracker' | 'explorer' | 'documents' | 'settings';

export default function App() {
  const account = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // 로컬 DB 초기화 및 데이터 로드
  const loadData = async () => {
    try {
      setLoading(true);
      const userProfile = await getOrCreateDefaultProfile();
      setProfile(userProfile);

      const allProjects = await db.projects.toArray();
      setProjects(allProjects);
    } catch (err) {
      console.error('Dexie.js 로컬 DB 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 처음 한 번, 그리고 동기화로 로컬 데이터가 바뀔 때마다 다시 읽는다
  useEffect(() => {
    loadData();
  }, [account.dataVersion]);

  // 샘플 데이터 시딩
  const handleSeedSamples = async () => {
    await seedSampleProjectsIfEmpty();
    await loadData();
  };

  // 프로젝트 비우기
  const handleClearProjects = async () => {
    if (window.confirm('저장된 프로젝트 목록을 모두 초기화할까요?')) {
      await db.projects.clear();
      await loadData();
    }
  };

  // 네비게이션 탭 5종 (docs/UI_UX.md 기준)
  const mainNavTabs = [
    { id: 'dashboard' as const, label: '대시보드', icon: LayoutDashboard },
    { id: 'profile' as const, label: '커리어 프로필 & 프로젝트', icon: UserCircle2 },
    { id: 'jd' as const, label: '채용공고 분석기', icon: FileSearch },
    { id: 'tracker' as const, label: '지원 트래커', icon: KanbanSquare },
    { id: 'explorer' as const, label: 'Career Explorer', icon: Compass },
    { id: 'documents' as const, label: '맞춤 문서 생성', icon: FilePenLine },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* =========================================================
          1. 상단 글로벌 헤더 & 네비게이션 바 (docs/UI_UX.md 사양 반영)
         ========================================================= */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between">
            {/* 좌측: 로고 & 플랫폼 명칭 */}
            <div 
              className="flex items-center space-x-3 cursor-pointer group"
              onClick={() => setActiveTab('profile')}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-indigo-200 group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-lg text-slate-900 tracking-tight">Career Intelligence</span>
                  <span className="bg-indigo-50 text-indigo-700 text-[11px] px-2 py-0.5 rounded-full font-semibold border border-indigo-100">
                    MVP v0.1
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">Personal Career Asset & JD Intelligence</p>
              </div>
            </div>

            {/* 우측 유틸리티: Local-First 상태 뱃지 & 설정 버튼 */}
            <div className="flex items-center space-x-3">
              {/* 로컬 퍼스트 인디케이터 */}
              <div 
                className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                title="외부 서버 없이 사용자 브라우저의 IndexedDB에 안전하게 영속 보관 중입니다."
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>🔒 Local-First (IndexedDB Ready)</span>
              </div>

              {account.status === 'ready' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="hidden md:inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-pointer"
                  title="계정에 로그인되어 암호화 동기화 중입니다"
                >
                  <span>☁ {account.sync.syncing ? '동기화 중…' : account.sync.error ? '동기화 오류' : '동기화됨'}</span>
                </button>
              )}
              {/* ⚙️ 설정 & 백업 버튼 */}
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`p-2 rounded-xl border transition-colors cursor-pointer flex items-center space-x-1.5 text-xs font-semibold ${
                  activeTab === 'settings'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border-slate-200'
                }`}
                title="설정 및 노션 연동, 백업"
              >
                <SettingsIcon className="w-4 h-4" />
                <span className="hidden sm:inline">설정 & 백업</span>
              </button>
            </div>
          </div>

          {/* 중앙 네비게이션 탭 바 */}
          <nav className="flex space-x-1 overflow-x-auto py-1.5 border-t border-slate-100">
            {mainNavTabs.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* =========================================================
          2. 메인 콘텐츠 영역 (선택된 탭에 따라 동적 전환)
         ========================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        {/* 탭 1: 대시보드 뷰 (Phase 3-0 구현 대기) */}
        {activeTab === 'dashboard' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  👋 안녕하세요, {profile?.name || '이지은'}님!
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  내 커리어 자산 요약: 프로젝트 {projects.length}건 · 보유 기술 {profile?.skills.length || 0}개 · 희망 직무: [{profile?.targetRole || '미설정'}]
                </p>
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
              >
                <span>프로필 & 프로젝트 관리 바로가기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-800 text-sm">⚡ 빠른 채용공고 분석</h3>
                <p className="text-xs text-slate-500">
                  채용 공고 URL을 입력하거나 공고 텍스트를 붙여넣어 즉시 적합도 매칭과 Evidence Gap을 분석할 수 있습니다.
                </p>
                <button
                  onClick={() => setActiveTab('jd')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  채용공고 분석기 열기
                </button>
              </div>

              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h3 className="font-bold text-slate-800 text-sm">📊 지원 파이프라인 요약</h3>
                <p className="text-xs text-slate-500">
                  현재 서류 제출 및 면접 전형이 진행 중인 지원 이력을 5단계 칸반 보드로 관리합니다.
                </p>
                <button
                  onClick={() => setActiveTab('tracker')}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-300 transition-colors cursor-pointer"
                >
                  지원 트래커 확인하기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 탭 2: 커리어 프로필 & 프로젝트 자산 관리 뷰 (핵심 구현 영역) */}
        {activeTab === 'profile' && (
          <ProfileView
            profile={profile}
            projects={projects}
            onDataRefresh={loadData}
          />
        )}

        {/* 탭 3: 채용공고 분석기 (Phase 3-2 완성) */}
        {activeTab === 'jd' && (
          <JdAnalysisView />
        )}

        {/* 탭 4: 지원 트래커 (Phase 3-4 완성) */}
        {activeTab === 'tracker' && (
          <ApplicationTrackerView />
        )}

        {/* 탭 5: Career Explorer (Phase 3-5 완성) */}
        {activeTab === 'explorer' && (
          <CareerExplorerView />
        )}

        {/* 탭: 맞춤 문서 생성 (Phase 5) */}
        {activeTab === 'documents' && <DocumentsView key={account.dataVersion} />}

        {/* 탭 6: 설정 & 노션 동적 연동 & 백업 (Phase 3-6 / 3-7 완성) */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">⚙️ 설정 & 노션 연동 & 데이터 백업</h3>
                <p className="text-xs text-slate-500 mt-0.5">로컬 저장소의 데이터를 백업하거나 외부 노션 데이터와 동적 1:1 매핑을 설정합니다.</p>
              </div>
            </div>

            <AccountPanel />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <BackupPanel onRestored={loadData} />

              <NotionAdapterPanel onImported={loadData} />

              <AiSettingsPanel />
            </div>
          </div>
        )}

        {/* =========================================================
            하단 개발용 퀵 DB 컨트롤 바
            개발 서버(npm run dev)에서만 표시. 프로덕션 빌드(Vercel 배포)에서는
            import.meta.env.DEV 가 false 로 고정되어 화면에서도, 번들 코드에서도 제거된다.
           ========================================================= */}
        {import.meta.env.DEV && (
          <div className="bg-slate-100/80 rounded-xl border border-slate-200/80 px-4 py-2 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-2">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                로컬 DB: <strong>CareerIntelligenceDB</strong> ({projects.length}개 프로젝트 영속 보관 중)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleSeedSamples}
                className="px-2.5 py-1 text-indigo-600 hover:bg-white border border-indigo-200/60 rounded-lg font-medium transition-colors cursor-pointer text-[11px]"
              >
                + 샘플 데이터 채우기
              </button>
              {projects.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearProjects}
                  className="px-2.5 py-1 text-rose-600 hover:bg-white border border-rose-200/60 rounded-lg font-medium transition-colors cursor-pointer text-[11px]"
                >
                  비우기
                </button>
              )}
              <button
                type="button"
                onClick={loadData}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="새로고침"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================
          3. 푸터
         ========================================================= */}
      <UploadConfirm />
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        Career Intelligence MVP © 2026 • Local-First Architecture with Dexie.js
      </footer>
    </div>
  );
}
