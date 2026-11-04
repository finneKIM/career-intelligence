export interface JobDescriptionSections {
  responsibilities: string[]; // 주요 업무
  qualifications: string[]; // 자격 요건
  preferred: string[]; // 우대 사항
}

export interface JobDescription {
  id: string; // 고유 ID (UUID)
  company: string; // 기업명
  role: string; // 채용 직무
  domain: string; // 산업/기술 분야
  rawText: string; // 공고 원문 전체 (Fail-Safe 보존)
  sourceUrl?: string; // 공고 원본 URL
  sections: JobDescriptionSections;
  parsedAt: string; // 파싱 일시 (ISO String)
}

export interface MatchEvidence {
  requirement: string; // 공고의 요구사항 문장
  matchedSkillOrExperience: string; // 매칭된 기술 또는 프로젝트 성과
  projectId?: string; // 근거 프로젝트 ID (선택)
  description: string; // 구체적 매칭 근거 설명
}

export interface EvidenceGap {
  requirement: string; // 공고의 요구사항 문장
  missingReason: string; // 매칭 부족 사유
  actionGuide: string; // 자기소개서/포트폴리오 보완 가이드
}

export interface AnalysisResult {
  id: string; // 고유 ID (UUID)
  jdId: string; // 분석 대상 공고 ID
  directMatches: MatchEvidence[]; // 🟢 직접 증명된 역량 (Keyword & 경험 일치)
  indirectMatches: MatchEvidence[]; // 🔵 간접 연결 경험 (유사 기술 및 도메인)
  evidenceGaps: EvidenceGap[]; // 🟠 증거 공백 (JD 요구 대비 부족한 부분)
  summaryScore: number; // 종합 역량 충족도 점수 (객관적 지표, 0~100)
  analyzedAt: string; // 분석 일시 (ISO String)
}
