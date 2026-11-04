// 사용자 노션 DB의 속성 메타데이터 (동적 감지)
export interface NotionPropertyMeta {
  id: string; // 속성 ID
  name: string; // 노션 컬럼 이름 (예: '프로젝트명', '사용기술', '진행기간')
  type: string; // 노션 타입 ('title' | 'multi_select' | 'select' | 'rich_text' | 'date' | 'url' 등)
}

// 스키마 스캔 결과 모델
export interface NotionSchemaDiscovery {
  databaseId: string;
  databaseTitle: string;
  properties: NotionPropertyMeta[]; // 감지된 모든 컬럼 메타 목록
}

// 1:1 컬럼 매핑 규칙
export interface NotionColumnMappings {
  title: string; // 노션 컬럼 ⟷ 프로젝트명 매핑
  techStack: string; // 노션 컬럼 ⟷ 기술 스택(태그) 매핑
  period: string; // 노션 컬럼 ⟷ 기간 매핑
  outcomes: string; // 노션 컬럼 ⟷ 수행 성과(불릿) 매핑
  role?: string; // 노션 컬럼 ⟷ 담당 역할 매핑 (선택)
  links?: string; // 노션 컬럼 ⟷ 링크 매핑 (선택)
}

// 노션 연동 및 매핑 환경설정
export interface NotionMappingConfig {
  id: string; // 고유 ID (기본: 'current-notion-config')
  sourceType: 'API' | 'CSV' | 'JSON';
  apiConfig?: {
    apiKey: string; // 노션 내부 통합 토큰 (Internal Integration Secret)
    databaseId: string;
  };
  columnMappings: NotionColumnMappings;
  lastSyncedAt?: string; // 최근 동기화 일시 (ISO String)
}
