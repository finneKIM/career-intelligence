import type { 
  Profile, 
  Project, 
  JobDescription, 
  AnalysisResult, 
  MatchEvidence, 
  EvidenceGap 
} from '../../types';

/**
 * 매칭 시 제외할 일반 불용어 (Stopwords)
 * 기술 역량이나 실질적 업무가 아닌 일반적인 한국어/영어 서술어
 */
const STOPWORDS = new Set([
  '기반', '경험', '개발', '활용', '수행', '관련', '능력', '역량', 
  '구축', '개선', '설계', '작성', '이해', '가능', '우대', '필수', 
  '제공', '지원', '경험자', '이상', '보유', '참여', '담당', '운영',
  'and', 'the', 'for', 'with', 'using', 'based', 'experience', 'skills'
]);

/**
 * 알려진 주요 기술 스택 및 키워드 추출용 정규화 헬퍼
 */
function extractKeywords(text: string): string[] {
  // 영문 단어, 한글 명사구 등 추출
  const matches = text.match(/[A-Za-z0-9+#.-]+|[가-힣]{2,}/g) || [];
  return Array.from(new Set(matches.map(w => w.toLowerCase())))
    .filter(k => k.length > 1 && !STOPWORDS.has(k));
}

/**
 * 3단계 지능형 매칭 엔진 (Strict Matcher)
 * 
 * 원칙:
 * 1. 키워드 과장 금지: 단순 단어 등장이 아닌 실제 프로젝트 성과(Evidence Bullets) 기반 평가.
 * 2. 3단계 명확한 구분:
 *    - 🟢 Direct: 프로젝트 핵심 성과(outcomes)에 명확한 수치나 경험이 명시됨.
 *    - 🔵 Indirect: 프로젝트 기술스택이나 프로필에는 있으나 성과 불릿에 구체적 증빙이 부족함.
 *    - 🟠 Gap: 내 자산에 관련 기술이나 프로젝트 근거가 없음.
 * 3. 점수는 '합격 확률'이 아니라 '요구 역량 객관적 충족도'로 계산.
 */
export function analyzeJobDescriptionMatch(
  jd: JobDescription,
  projects: Project[],
  profile: Profile | null
): AnalysisResult {
  const directMatches: MatchEvidence[] = [];
  const indirectMatches: MatchEvidence[] = [];
  const evidenceGaps: EvidenceGap[] = [];

  // 분석 대상 요구사항 목록 (자격 요건 우선, 그 다음 주요 업무, 우대 사항)
  const requirementsToAnalyze = [
    ...jd.sections.qualifications.map(req => ({ text: req, type: 'qualification' })),
    ...jd.sections.responsibilities.map(req => ({ text: req, type: 'responsibility' })),
    ...jd.sections.preferred.map(req => ({ text: req, type: 'preferred' })),
  ];

  // 구직자 보유 전체 기술 (프로필 + 프로젝트 기술 스택 통합)
  const allUserSkills = Array.from(
    new Set([
      ...(profile?.skills || []).map(s => s.toLowerCase()),
      ...projects.flatMap(p => p.techStack.map(s => s.toLowerCase())),
    ])
  );

  for (const { text: reqText } of requirementsToAnalyze) {
    const reqKeywords = extractKeywords(reqText);
    let matchedDirectly = false;
    let matchedIndirectly = false;

    // 1단계: 프로젝트 성과 불릿(outcomes)에서 직접 증거 탐색 (🟢 Direct Match)
    for (const project of projects) {
      for (const outcome of project.outcomes) {
        const outcomeKeywords = extractKeywords(outcome);
        const commonKeywords = reqKeywords.filter(k => 
          k.length > 1 && outcomeKeywords.some(ok => ok.includes(k) || k.includes(ok))
        );

        if (commonKeywords.length > 0) {
          directMatches.push({
            requirement: reqText,
            matchedSkillOrExperience: `[${project.title}] ${outcome}`,
            projectId: project.id,
            description: `프로젝트 '${project.title}'의 핵심 성과에서 관련 역량('${commonKeywords.join(', ')}')이 정량적으로 직접 증명되었습니다.`,
          });
          matchedDirectly = true;
          break;
        }
      }
      if (matchedDirectly) break;
    }

    if (matchedDirectly) continue;

    // 2단계: 프로젝트 기술 스택 또는 프로필 보유 기술에서 간접 연결 탐색 (🔵 Indirect Match)
    const matchedSkills = allUserSkills.filter(userSkill =>
      reqKeywords.some(k => k.length > 1 && (userSkill.includes(k) || k.includes(userSkill)))
    );

    if (matchedSkills.length > 0) {
      // 관련 프로젝트가 있는지 확인
      const relatedProject = projects.find(p => 
        p.techStack.some(t => matchedSkills.includes(t.toLowerCase()))
      );

      indirectMatches.push({
        requirement: reqText,
        matchedSkillOrExperience: matchedSkills.join(', ').toUpperCase(),
        projectId: relatedProject?.id,
        description: relatedProject 
          ? `'${relatedProject.title}' 프로젝트에서 해당 기술(${matchedSkills.join(', ')})을 활용한 경험이 있어 전이 가능합니다. 다만 구체적인 수치 성과 불릿을 보완하면 직접 증명으로 전환될 수 있습니다.`
          : `보유 기술 스택(${matchedSkills.join(', ')})에 포함되어 있어 기초 역량을 어필할 수 있습니다.`,
      });
      matchedIndirectly = true;
    }

    // 3단계: 근거가 전혀 없는 경우 증거 공백 처리 (🟠 Evidence Gap)
    if (!matchedDirectly && !matchedIndirectly) {
      // 키워드 중 주요 단어 추출
      const primaryKeyword = reqKeywords.find(k => k.length >= 3) || '해당 직무 요건';

      evidenceGaps.push({
        requirement: reqText,
        missingReason: `현재 등록된 프로젝트 성과 및 기술 스택에서 '${primaryKeyword}' 관련 구체적 실무 증빙을 확인하기 어렵습니다.`,
        actionGuide: `자기소개서 작성 시 인접 도메인에서의 빠른 학습 경험이나 유사 문제 해결 사례를 어필하고, 면접 전 '${primaryKeyword}' 관련 실습 코드나 토이 프로젝트를 추가 보완하는 것을 추천합니다.`,
      });
    }
  }

  // 총 요구사항 대비 역량 충족도 점수 계산 (직접 증명: 1점, 간접 연결: 0.5점)
  const totalReqCount = requirementsToAnalyze.length;
  let summaryScore = 0;

  if (totalReqCount > 0) {
    const rawScore = (directMatches.length * 1.0 + indirectMatches.length * 0.5) / totalReqCount * 100;
    summaryScore = Math.min(100, Math.round(rawScore));
  }

  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    jdId: jd.id,
    directMatches,
    indirectMatches,
    evidenceGaps,
    summaryScore,
    analyzedAt: new Date().toISOString(),
  };
}
