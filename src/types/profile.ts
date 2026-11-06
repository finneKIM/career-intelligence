export interface Profile {
  id: string; // 고유 ID (기본 사용자: 'current-user')
  name: string; // 사용자 이름
  title: string; // 한 줄 소개 / 현재 직무
  targetRole: string; // 희망 직무 (예: AI Applied Engineer)
  targetDomains: string[]; // 관심 도메인 (예: ['소리 & 오디오', '미디어 & 생성형 AI'])
  skills: string[]; // 보유 기술 스택 태그 (예: ['PyTorch', 'FastAPI', 'Docker'])
  // 연락처·가림 규칙: AI에 보내기 전에 가리는 용도(AI에는 보내지 않음). 백업 파일에는 포함됨
  email?: string;
  phone?: string;
  address?: string;
  redactTerms?: string[]; // 사용자 지정 가림 단어 (학교·이전 회사·영문 이름 표기 등)
  updatedAt: string; // 최근 수정 일시 (ISO 8601 String)
}

export interface ProjectPeriod {
  startDate: string; // 'YYYY-MM'
  endDate?: string; // 'YYYY-MM' (진행 중일 경우 undefined)
  isOngoing: boolean; // 진행 중 여부
}

export interface ProjectLink {
  title: string;
  url: string;
}

export interface Project {
  id: string; // 고유 ID (UUID)
  title: string; // 프로젝트명
  period: ProjectPeriod; // 수행 기간
  role: string; // 담당 역할
  techStack: string[]; // 사용 기술 스택 태그
  description: string; // 프로젝트 개요
  outcomes: string[]; // 정량적 성과 및 기여 내용 불릿 포인트
  links?: ProjectLink[]; // 깃허브, 데모, 기술 블로그 링크
  createdAt: string; // 생성 일시 (ISO String)
  updatedAt: string; // 수정 일시 (ISO String)
}
