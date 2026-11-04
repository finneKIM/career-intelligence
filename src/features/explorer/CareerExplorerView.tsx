import { useState, useEffect } from 'react';
import { 
  Compass, 
  Sparkles, 
  ArrowRight, 
  UserCircle2
} from 'lucide-react';
import type { Profile } from '../../types';
import { db, getOrCreateDefaultProfile } from '../../db';
import { calculateRoleDomainMatrix, type MatrixCell } from './explorerEngine';
import { RoleDomainMatrix } from './RoleDomainMatrix';
import { ExplorerDetailModal } from './ExplorerDetailModal';

export function CareerExplorerView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [matrix, setMatrix] = useState<MatrixCell[]>([]);
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);
  const [loading, setLoading] = useState(true);

  // 로컬 DB에서 프로필 및 프로젝트 로드 후 매트릭스 계산
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const userProfile = await getOrCreateDefaultProfile();
        setProfile(userProfile);

        const allProjects = await db.projects.toArray();

        // 4x4 매트릭스 계산
        const calculated = calculateRoleDomainMatrix(userProfile.skills || [], allProjects);
        setMatrix(calculated);
      } catch (err) {
        console.error('Career Explorer 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // 상위 추천 인접 커리어 Top 2 추출 (점수 내림차순)
  const topRecommendations = [...matrix].sort((a, b) => b.score - a.score).slice(0, 2);

  return (
    <div className="space-y-6">
      {/* 1. 상단 타이틀 배너 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <Compass className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Career Explorer (인접 직무 × 도메인 탐색기)
              </h2>
              <span className="bg-indigo-50 text-indigo-700 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-100">
                16개 교차 조합 진단
              </span>
            </div>
            <p className="text-xs text-slate-500">
              내 보유 기술과 프로젝트 성과를 기반으로, 4대 핵심 테크 직무와 4대 산업 도메인 간의 교차 적합도를 진단하고 최적의 커리어 확장 로드맵을 제시합니다.
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center space-x-3 shrink-0">
            <UserCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-800 block">내 현재 설정</span>
              <span className="text-[11px] text-slate-500">
                희망 직무: [{profile?.targetRole || '미설정'}] · 보유 기술: {profile?.skills.length || 0}개
              </span>
            </div>
          </div>
        </div>

        {/* 2. 최고 추천 인접 커리어 하이라이트 카드 (Top 2) */}
        {!loading && topRecommendations.length > 0 && (
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center space-x-1.5 pb-2.5 text-xs font-bold text-slate-800">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>현재 내 기술 자산 기반 최우선 추천 인접 커리어</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topRecommendations.map((cell, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedCell(cell)}
                  className="bg-gradient-to-br from-indigo-50/60 to-white border border-indigo-100 hover:border-indigo-300 rounded-xl p-4 transition-all cursor-pointer shadow-2xs hover:shadow-xs group space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className="px-2 py-0.5 bg-indigo-600 text-white font-bold text-[11px] rounded-md">
                        추천 {idx + 1}위
                      </span>
                      <span className="font-bold text-xs text-slate-900">
                        {cell.role}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs font-semibold text-slate-600">
                        {cell.domain}
                      </span>
                    </div>
                    <span className="text-lg font-black text-indigo-700">
                      {cell.score}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-1 leading-relaxed">
                    {cell.actionGuide}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-indigo-100/60 text-[11px]">
                    <span className="text-slate-500">
                      강점 기술: {cell.matchedSkills.slice(0, 3).join(', ')}
                    </span>
                    <span className="font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center space-x-0.5">
                      <span>로드맵 보기</span>
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. 4x4 인터랙티브 매트릭스 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Career Explorer 데이터를 분석 중입니다...
        </div>
      ) : (
        <RoleDomainMatrix
          matrix={matrix}
          onSelectCell={(cell) => setSelectedCell(cell)}
        />
      )}

      {/* 4. 상세 로드맵 팝업 모달 */}
      <ExplorerDetailModal
        isOpen={Boolean(selectedCell)}
        onClose={() => setSelectedCell(null)}
        cell={selectedCell}
      />
    </div>
  );
}
