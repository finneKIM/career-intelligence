// Phase 5: 과거 자료 · 기업 자료 · AI 생성 문서 모델

export type DocKind = 'RESUME' | 'COVER_LETTER' | 'PORTFOLIO';

/** 사용자가 직접 입력한 과거 이력서·자소서·포트폴리오 원문 (이름·연락처는 저장 전 자리표시자로 치환) */
export interface SourceDocument {
  id: string;
  kind: DocKind;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type MaterialStatus = 'OK' | 'FAILED';

export interface CompanySummary {
  /** AI가 자료에서 정리한 항목. 근거 문장은 사용자가 붙여 넣은 원문에 있어야 한다 */
  overview: string;
  keyPoints: string[];
  talentTraits: string[];
  generatedAt: string;
  model: string;
}

/** 공고에 연결된 기업 자료(붙여넣기 / URL 읽기 / Google 검색). URL 읽기는 서버가 robots.txt 확인 후 시도하고, 실패하면 사유를 기록하고 붙여넣기를 안내한다 */
export interface CompanyMaterial {
  id: string;
  jdId: string;
  sourceType: 'PASTE' | 'URL' | 'SEARCH';
  title: string;
  /** 출처 URL(선택). 수집 대신 사용자가 붙여 넣은 본문이 content 이다 */
  url?: string;
  content: string;
  collectedAt: string;
  status: MaterialStatus;
  failureReason?: string;
  summary?: CompanySummary;
  /** SEARCH 일 때 Google 검색이 돌려준 출처(https) */
  sources?: { url: string; title: string }[];
  updatedAt: string;
}

export interface EvidenceRef {
  type: 'project' | 'outcome' | 'skill' | 'source';
  refId: string;
  label: string;
}

export interface GeneratedParagraph {
  text: string;
  /** 문장마다 근거를 연결한다. 비어 있으면 검수 화면에서 "근거 없음"으로 경고 */
  evidence: EvidenceRef[];
}

export interface GeneratedSection {
  heading: string;
  paragraphs: GeneratedParagraph[];
}

/** AI로 생성한 문서. 덮어쓰지 않고 버전으로 보존하며, 사용자가 확정하기 전에는 DRAFT */
export interface GeneratedDocument {
  id: string;
  kind: DocKind;
  jdId: string;
  title: string;
  sections: GeneratedSection[];
  generatedAt: string;
  model: string;
  analysisVersion: string;
  status: 'DRAFT' | 'CONFIRMED';
  /** 이전 버전 id (재생성·수정 시) */
  previousVersionId?: string;
  /** 6-E: 이 문서를 만들 때 사용자가 고른 어필 포인트(직접/간접 경험 구분 포함) */
  appealPoints?: { term: string; level: 'DIRECT' | 'INDIRECT' }[];
  updatedAt: string;
}

/** 로컬 전용 동기화 보조 기록 */
export interface SyncRecord {
  key: string; // `${table}:${id}`
  table: string;
  recordId: string;
  revision: number;
  hash: string;
  seq: number;
}
export interface SyncStateItem {
  key: string;
  value: string | number;
}
export interface SyncConflict {
  id: string;
  table: string;
  recordId: string;
  /** 덮어써진 쪽(로컬)의 사본 JSON */
  localCopy: string;
  createdAt: string;
}
