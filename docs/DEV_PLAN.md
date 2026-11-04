# 개발 계획 및 로드맵 (DEV_PLAN.md)

이 문서는 기술 스택 선정 이유와 단계별 개발 진행 상황(체크리스트)을 관리하는 문서입니다.

---

## 1. 기술 스택 (실제 설치 버전 기준)

> 아래 버전은 `node_modules`에서 직접 확인한 **실제 설치 버전**입니다. `package.json` 명세와 일부 차이가 있을 수 있으나, 실제 동작 기준을 우선합니다.

| 분류 | 기술 | 실제 설치 버전 | 비고 |
| :--- | :--- | :--- | :--- |
| **프론트엔드 프레임워크** | React | `18.3.1` | package.json에는 `^19`로 명시되어 있으나 실제 설치는 18.x |
| **언어** | TypeScript | `5.9.3` | Strict 모드 활성화 |
| **빌드 도구** | Vite | `6.4.5` | `vite.config.ts` 기준, `@vitejs/plugin-react` 포함 |
| **스타일링** | Tailwind CSS | `3.4.19` | package.json에는 `^4.x` 명시, 실제 설치는 3.x |
| **클라이언트 DB** | Dexie.js (IndexedDB 래퍼) | `4.4.7` | 로컬 퍼스트 아키텍처 핵심. 외부 서버 없이 브라우저 내 영속 저장 |
| **아이콘** | Lucide React | `0.475.0` | package.json에는 `^1.16.0` 명시, 실제 설치는 0.x 최신 |
| **테스트** | Vitest | `3.2.7` | 단위 테스트 및 회귀 테스트 |

> ✅ **package.json 정돈 완료 (2026-11-04)**: 미설치 상태로 이름만 적혀 있던 `next`, `shadcn`, `@vercel/analytics`, `@base-ui/react` 등을 모두 제거하고, 실제 프로젝트(`src/`)에서 구동 중인 핵심 패키지만으로 `package.json`을 깔끔하게 일원화했습니다. TypeScript 설정(`tsconfig.json`)도 Vite 단독 빌드 체계로 정돈하여 `npm run build` 무결성을 확보했습니다.

---

## 2. 배포 환경 (Deployment)

### ① 배포 플랫폼: Vercel

| 항목 | 내용 |
| :--- | :--- |
| **플랫폼** | [Vercel](https://vercel.com) |
| **배포 방식** | Vite 빌드 결과물(`dist/`) 정적 파일 호스팅 |
| **빌드 명령** | `tsc && vite build` |
| **출력 디렉터리** | `dist/` |
| **SPA 라우팅** | 현재 탭 전환은 React `useState` 기반(URL 변경 없음)이므로 별도 `vercel.json` 리라이트 설정 불필요 |
| **환경 변수** | MVP 단계에서는 외부 서버 없음 → 환경 변수 없음. 노션 API 연동 단계(Phase 3-6)에서 `VITE_NOTION_TOKEN` 등 추가 예정 |

### ② Vercel 배포 시 주의사항

- **IndexedDB는 사용자 브라우저에만 존재**: Vercel 서버에는 사용자 데이터가 일절 저장되지 않습니다. 배포 후 각 사용자는 본인 브라우저의 독립된 로컬 저장소를 사용합니다.
- **개인 데이터 이전 불가**: 브라우저를 바꾸거나 시크릿 모드로 접속하면 데이터가 없는 상태에서 시작합니다. 이를 보완하기 위해 **JSON 백업/복원 기능(Phase 3-7)**이 필수입니다.
- **Vercel Analytics**: `@vercel/analytics`는 package.json에 명시되어 있으나 현재 미설치 상태입니다. 배포 시점에 필요하면 별도 설치 후 `src/main.tsx`에 `inject()` 호출 추가 예정.

---

## 3. 데이터 저장 전략 (Data Storage Strategy)

### ① 저장 계층 구조

```
사용자 브라우저
└── IndexedDB (Dexie.js: "CareerIntelligenceDB")
    ├── profiles         # 구직자 기본 프로필 (단일 레코드 'current-user')
    ├── projects         # 프로젝트 경험 자산 (복수)
    ├── jobDescriptions  # 파싱된 채용 공고 원문 보존 (복수)
    ├── applications     # 지원 이력 (복수)
    ├── analysisResults  # JD 매칭 분석 결과 (복수, 불변 스냅샷)
    └── notionConfigs    # 노션 1:1 컬럼 매핑 설정 (복수)
```

### ② 데이터 보존 원칙

| 원칙 | 내용 |
| :--- | :--- |
| **로컬 퍼스트 (Local-First)** | 모든 데이터는 외부 서버 전송 없이 사용자 브라우저의 IndexedDB에만 저장. |
| **불변 스냅샷 (Immutable Snapshot)** | 지원 이력 등록 시점의 JD 원문, 제출 자료, 분석 결과는 이후 프로필 변경에 무관하게 영구 고정. |
| **JSON 백업/복원 (Fail-Safe Export)** | 브라우저 초기화·기기 변경에 대비하여 전체 DB를 단일 JSON 파일로 내보내기/가져오기. |
| **스키마 버전 관리** | Dexie.js 버전 업그레이드 시 `db.version(N).stores(...).upgrade(...)` 마이그레이션 훅으로 데이터 손실 방지. |

### ③ 분석 결과(Analysis Result) 저장 방식

```
analysisResults 테이블
├── id              : UUID (고유 식별자)
├── applicationId   : Application 테이블 FK (지원 이력과 연결)
├── jobDescriptionId: JobDescription 테이블 FK
├── matchScore      : 수치 점수 (합격률 아님 — 충족/간접/공백 건수 기반)
├── directMatches   : MatchEvidence[] (직접 증명된 역량 목록)
├── indirectMatches : MatchEvidence[] (간접 연결 역량 목록)
├── evidenceGaps    : EvidenceGap[]   (증거 공백 및 보완 가이드)
├── analyzedAt      : ISO 8601 타임스탬프 (분석 수행 시점)
└── analysisVersion : string (분석 로직 버전, 예: "v1.0")
```

> 분석 결과는 **재분석해도 기존 결과를 덮어쓰지 않습니다.** 새로운 분석은 새 레코드로 추가 저장되며, 지원 이력 스냅샷에 연결된 과거 분석은 항상 보존됩니다.

---

## 4. 개발 단계별 체크리스트 (한 번에 한 단계씩)

---

## 4. 개발 단계별 체크리스트 (한 번에 한 단계씩)

### Phase 1: 기획 및 기본 문서화
- [x] 협업 규칙 및 개발 기준 수립 ([AGENTS.md](../AGENTS.md))
- [x] 프로젝트 디렉터리 및 문서 체계 셋업 (`docs/`, `src/`, `tests/`)
- [x] 서비스 비전 및 아이디어 구체화 ([docs/IDEA.md](IDEA.md))
- [x] 제품 요구사항 정의서 작성 ([docs/PRD.md](PRD.md))
- [x] 화면 및 UI 흐름 설계 ([docs/UI_UX.md](UI_UX.md))
- [x] 시스템 아키텍처 및 데이터 모델 구체화 ([docs/ARCHITECTURE.md](ARCHITECTURE.md))

### Phase 2: 프로젝트 환경 구축
- [x] React + Vite + TypeScript + Tailwind CSS 개발 환경 초기화
- [x] Dexie.js DB 스키마 셋업 및 동작 검증
- [x] 기본 라우팅 및 레이아웃 셸(Header, Navigation) 구성

### Phase 3: MVP 5대 기능 단계별 구현
- [x] 1단계: 커리어 프로필 & 프로젝트 자산 관리 기능
- [x] 2단계: JD 파싱 & 구조화 입력 폼 (URL + 직접 입력 Fail-Safe)
- [x] 3단계: 3단계 지능형 매칭 엔진 (직접/간접/Evidence Gap 분석)
- [ ] 4단계: 지원 이력 트래커 (Application Tracker & 불변 스냅샷 보존)
- [ ] 5단계: Career Explorer (Role × Domain 교차 추천 매트릭스)
- [ ] 6단계: 외부 데이터 연동 (사용자 맞춤형 노션 동적 스키마 감지 및 1:1 매핑 어댑터)
- [ ] 7단계: 데이터 백업 및 복원 (JSON 내보내기/가져오기)

### Phase 4: GitHub 연동 & 개인정보(PII) 완전 삭제 및 안전 업로드
- [x] Git 로컬 저장소 초기화 (`git init`, 기본 브랜치 `main` 설정)
- [x] 보안 강화 `.gitignore` 파일 설정 (빌드 산출물, 개인 환경변수, OS/IDE 캐시, 로그 파일 원천 차단)
- [x] 문서 및 코드 내 로컬 절대 경로(`C:/Users/...`) 상대 경로로 전수 정제
- [ ] 개인 식별 정보(이름, 이메일, 민감 경로, 토큰 등) 전수 검사 및 익명화/제거 확인
- [ ] 사용자 지정 GitHub 원격 저장소(`git remote add origin <URL>`) 연결 및 1차 안전 커밋/푸시 대기

---

## 5. 검증 및 확인 기록
- **2026-11-02**: 협업 지침(AGENTS.md), 아이디어 노트(IDEA.md), 제품 요구사항 정의서(PRD.md) 수립 완료.
- **2026-11-02**: React + Vite + TypeScript + Tailwind CSS 개발 환경 구축 및 `npm run build` 번들링 검증 완료.
- **2026-11-03**: TypeScript 핵심 데이터 규격 정의(`src/types/`) 및 Dexie.js 기반 브라우저 로컬 데이터베이스(`src/db/`) 구축 완료. Vitest 단위 테스트 및 프로덕션 빌드 통과.
- **2026-11-03**: `temp.md` UI 프롬프트 사양 분석 및 차이점 반영 완료. Phase 3-1 [커리어 프로필 & 프로젝트 자산 관리 UI] 구현 (`ProfileView`, `ProjectModal`, `ProjectCard`, `App.tsx` 글로벌 네비게이션 셸 및 IndexedDB 실시간 연동). Vitest 테스트 3개 및 프로덕션 번들링 통과.
- **2026-11-03**: Phase 3-1 [커리어 프로필 & 프로젝트 자산 관리 기능](src/features/profile/) 구현 완료. 2열 반응형 레이아웃, 실시간 검색/태그 필터, 프로젝트 CRUD 및 성과 불릿 다이나믹 모달, IndexedDB 영속화 및 `npm run build` 검증 완료.

- **2026-11-04**: `package.json` 스크립트 오류 수정 (`next dev` → `vite`). 로컬 개발 서버 `http://localhost:5173` 정상 구동 확인. `docs/DEV_PLAN.md` 기술 스택 실제 버전 반영 및 Vercel 배포 전략·데이터 저장 전략 문서화 완료. `docs/design.md` UI 디자인 시스템 최초 작성 완료.
- **2026-11-04**: Phase 3-2 [JD(채용공고) 파싱 & 구조화 입력 폼] 구현 완료. 정규식 기반 지능형 파서 엔진(`jdParserService.ts`), Fail-Safe URL/직접입력 폼 모달(`JdInputModal.tsx`), 구조화된 섹션별 상세 카드 및 인라인 편집(`JdDetailCard.tsx`), 전체 공고 목록 및 검색 관리 뷰(`JdAnalysisView.tsx`), IndexedDB 영속화 연동 완료. Vitest 단위 테스트 7개(신규 4개 포함) 및 `npm run build` 번들링 100% 통과.
- **2026-11-04**: Phase 3-3 [3단계 지능형 매칭 엔진 (직접/간접/Evidence Gap 분석)] 구현 완료. 프로젝트 성과 불릿 기반 3단계 대조 분석 알고리즘(`matchingEngine.ts`), 불용어(Stopwords) 필터링, 객관적 역량 충족도 산출, 상세 리포트 팝업 모달(`MatchingReportModal.tsx`), 공고 카드 연동 및 IndexedDB(`db.analysisResults`) 불변 스냅샷 영속화 완료. Vitest 단위 테스트 11개(신규 4개 포함) 및 `npm run build` 번들링 100% 통과.