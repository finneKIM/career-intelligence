# 배포 및 환경 기록 (DEPLOY.md)

이 문서는 서비스의 배포 환경, 호스팅 정보, 환경 변수 목록 및 릴리즈 이력을 기록하는 문서입니다.

---

## 1. 배포 환경 정보
- **호스팅 플랫폼**: Vercel (GitHub 저장소 연동)
- **도메인**: Vercel 기본 도메인 `https://career-intelligence-ruby.vercel.app` (커스텀 도메인 없음)
- **배포 방식**: GitHub 연동 자동 배포 (`main` 푸시 시 배포). 환경 변수는 `GEMINI_API_KEY`만 등록된 상태(2026-11-05, 사용자 보고). `APP_ACCESS_CODE`는 없으므로 서버가 운영자 키를 쓰지 않음(fail-closed)

## 2. 필수 환경 변수 (Environment Variables)
| 환경 변수명 | 설명 | 예시값 / 주의사항 |
| :--- | :--- | :--- |
| *(아래 "서버리스 API" 절과 `.env.example` 참고. 모두 선택 사항이며 비워도 방문자 BYOK로 동작)* | | |

## 3. 배포 및 릴리즈 이력
| 버전 | 배포일자 | 주요 변경 내용 | 비고 |
| :--- | :--- | :--- | :--- |
| v0.0.1 | 2026-11-02 | 문서 구조 및 프로젝트 셋업 완료 | 초기 준비 |
| v0.1.0 | 2026-11-05 | 첫 Vercel 배포 (Phase 3 전체 + AI·노션 서버리스 프록시) | 아래 "배포 환경 점검 기록" 참고 |

### 배포 환경 점검 기록 (2026-11-05, 외부에서 curl로 확인)
| 항목 | 결과 |
| :--- | :--- |
| 화면 `/` | HTTP 200, 빌드 산출물(`assets/index-C2HbHQ4r.js`)이 로컬 빌드와 동일 이름 |
| 보안 헤더 | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy 적용됨. `/api/*`는 `Cache-Control: no-store` |
| `/api/health` | 200. `{"llm":true,"accessCodeRequired":false,"byok":true}` — `api/` 함수가 Vite 앱과 함께 동작함 |
| 운영자 키 보호(fail-closed) | 접근 코드 없이, 또는 틀린 코드로 `/api/llm` 호출 → 모두 503 "키가 필요합니다". 잘못된 본문으로 시험해 Google 호출·키 소모 없음 |
| 출처 검사 | 다른 Origin → 403 |
| 노션 프록시 | 토큰 없이 호출 → 400 (외부 호출 없음) |
| 키 노출 | 배포된 JS·CSS에서 `AIza…` 패턴 0건, `GEMINI_API_KEY`·`APP_ACCESS_CODE` 문자열 0건 |
| 외부 리소스 | JS·CSS에서 CSP가 막을 외부 로딩(폰트·CDN 등) 없음(발견된 주소는 링크·네임스페이스) |
| 알려진 결함 ①(2026-11-06 해결) | `/vite.svg`(파비콘) 404 — `index.html`이 없는 파일을 가리킴. 동작에는 영향 없음. → **로컬 코드는 수정함(2026-11-05)**: `public/favicon.svg`(앱 헤더 로고와 같은 인디고+Sparkles)로 교체, `index.html` 링크 수정. 라이브 미반영 — 반영 후 `/favicon.svg`가 200인지, 브라우저 탭 아이콘이 보이는지 확인할 것(캐시 시 Ctrl+Shift+R). 참고: `public/icon.svg` 등 v0 템플릿 이미지 9개는 사용하지 않지만 라이브에서 그대로 서빙됨 |
| 알려진 결함 ②(2026-11-06 해결: 푸시 후 라이브 번들에서 문구 0건) | **개발용 하단 컨트롤 바가 라이브 서버에도 그대로 표시됨**(`src/App.tsx`에 개발 모드 조건 없음, 배포 번들에 문구 확인). "+ 샘플 데이터 채우기"와 "비우기"(확인 창 후 프로젝트 전체 삭제) 버튼이 방문자에게 보임. 영향은 방문자 본인 브라우저 데이터에 한정(다른 사용자·서버 데이터 무관)이나 노션에서 가져온 프로젝트를 실수로 지울 수 있음. `design.md` 13절의 "프로덕션에서는 숨김" 원칙과 불일치 → **로컬 코드는 수정함(2026-11-05, `import.meta.env.DEV` 조건: 개발 서버에서만 표시, 프로덕션 번들에서 제거 확인). 라이브에는 아직 미반영** — 커밋·푸시하면 Vercel이 자동 배포하여 반영됨(사용자 지시 대기). 반영 후 `/assets/index-*.js`에서 "샘플 데이터 채우기" 문구 0건인지 재확인할 것 |
| **미확인** | 브라우저에서 실제 화면이 깨지지 않는지(CSP 위반 여부), 배포본에서 방문자 키로 AI 실호출, 배포본에서 노션 실호출, 응답 시간, Vercel 프로젝트의 Fluid compute·Function Max Duration 설정 |


---

## API 키 / 비밀 값 관리 원칙

- **GitHub에는 키를 절대 올리지 않습니다.** `.env`, `.env.*`(단 `.env.example` 제외), `*.pem`, `*.key`, `secrets/`는 `.gitignore`로 차단됩니다.
- **로컬 개발**: `.env.example`을 `.env.local`로 복사해 값을 입력합니다. (`.env.local`은 git 추적 제외)
- **Vercel 배포**: Vercel 대시보드 → Project → Settings → Environment Variables에 직접 입력합니다. 저장소에는 값이 남지 않습니다.
- **`VITE_` 접두사 금지(비밀 키)**: `VITE_` 변수는 빌드된 JS 번들에 포함되어 방문자에게 노출됩니다. 비밀 키는 접두사 없이 이름을 짓고 Vercel 서버리스 함수(`/api/*`)에서만 읽습니다.
- **커밋 전 점검**: `git diff --cached`로 키 문자열이 없는지 확인합니다. 실수로 커밋/푸시한 키는 삭제가 아니라 **즉시 폐기(재발급)** 해야 합니다 (git 이력에 남기 때문).
- 노션 토큰 등 사용자 입력 키는 백업 JSON에서도 제외됩니다 (`backupService.ts`).
- **개인 데이터(노션에서 가져온 프로젝트, 공고, 지원 이력, 백업 JSON)는 저장소에 없습니다.** 앱 데이터는 (현재) 사용자 브라우저의 IndexedDB에만 있습니다(계정 기능을 쓰는 사용자는 암호화된 사본만 Neon DB에 동기화 — 구현 완료·배포 전). 백업 파일(`career-intel-backup-날짜.json`)·CSV 등을 프로젝트 폴더에 저장해도 올라가지 않도록 `.gitignore`가 막지만, 이 파일들은 프로젝트 폴더 밖(예: 문서 폴더)에 보관하는 것을 권장합니다. 푸시 전에는 `git status`와 `git diff --cached --name-only`로 올라갈 파일 목록을 확인하세요.

### 서버리스 API (LLM · 노션) — 방문자별 키 방식 (BYOK)

접속하는 사람마다 노션 계정·DB·Gemini 키가 다르므로, **서버에는 방문자의 비밀 값을 두지 않고** 방문자가 앱 화면에 직접 입력합니다.

| 경로 | 역할 | 인증 |
| :--- | :--- | :--- |
| `/api/llm` | Gemini 호출 (공고 구조화 / 매칭 분석 / 문장 다듬기) | ① 방문자 본인 키(`x-gemini-key` 헤더) — 접근 코드 불필요 ② 운영자 키(`GEMINI_API_KEY`) — `APP_ACCESS_CODE`가 설정되고 일치할 때만 |
| `/api/models` | 이 키로 쓸 수 있는 텍스트 생성 모델 목록(추천 순). 사용자 데이터 전송·호출 한도 소모 없음 | `/api/llm`과 동일(방문자 키 또는 접근 코드) |
| `/api/notion` | 노션 API 프록시 | 방문자 본인의 통합 토큰(요청 본문). 서버 토큰 없음, 접근 코드 불필요 |
| `/api/health` | 서버 상태 확인 | 없음 |

- **모델 선택**: 기본은 **자동** — 방문자 키로 모델 목록을 조회해 Flash 안정판의 최신 버전을 고르고(TTS·이미지·임베딩 등 제외), 이 키로 쓸 수 없거나(403/404) 일시적으로 응답하지 못하거나(5xx) 시간이 초과되면 다음 후보로 넘어갑니다(최대 6개). 전체 시간 예산은 40초, 시도당 제한은 15초입니다. 실패한 모델은 같은 서버 인스턴스 메모리에서 10분간 후순위로 밀리며(서버리스 인스턴스가 바뀌면 초기화), 응답에는 사용된 모델(`model`)과 건너뛴 모델(`attempts`)이 포함됩니다. 사용자가 직접 고른 모델은 재시도하지 않습니다. **실행 시간 한도(Vercel 공식 문서, 2026-11-05 조회)**: Fluid compute(신규 프로젝트 기본 활성)에서는 Hobby 플랜도 기본·최대 300초이므로 40초 예산은 들어갑니다. 단, 프로젝트가 Fluid compute를 끈 상태이거나 문서 내용이 바뀌었을 수 있어 Vercel 대시보드(Settings > Functions)에서 Fluid compute 사용 여부와 Function Max Duration을 직접 확인해야 합니다. `vercel.json`에는 별도 실행 시간 설정을 두지 않았습니다. **실제 배포 환경에서 끊기는지는 아직 미확인**입니다. 방문자는 설정 탭에서 모델을 직접 고를 수 있고(`x-gemini-model` 헤더), 운영자는 `GEMINI_MODEL`로 고정할 수 있습니다. 우선순위: 방문자 선택 > `GEMINI_MODEL` > 자동. 모델 목록은 키 해시 기준으로 30분 메모리 캐시합니다(키 자체는 저장하지 않음).
- **Gemini 모델 운영 메모 (관찰일: 2026-11-05, 운영자 키 1개 기준)** — 아래는 실제 호출 시험에서 관찰한 결과이며 **보장이 아닙니다.** 모델 가용성은 키(계정·가입 시기)와 시점에 따라 달라지고, 과부하(503)는 일시적이라 며칠 뒤 순위가 바뀔 수 있습니다. 코드에는 모델명을 고정하지 않았고(자동 선택), 이 표는 설정 탭에서 직접 고르거나 `GEMINI_MODEL`로 고정할 때 참고하는 용도입니다.

  | 구분 | 모델 | 근거 |
  | :--- | :--- | :--- |
  | 추천 | `gemini-3.6-flash` | 문장 다듬기·공고 구조화 호출 성공 |
  | 추천 | `gemini-3.5-flash` | 매칭 심층 분석 호출 성공 |
  | 자동 1~2순위이나 불안정 | `gemini-3.8-flash`, `gemini-3.7-flash` | 과부하(503)·시간 초과로 반복 실패 (자동 모드는 건너뛰고 다음 후보 사용) |
  | 사용 불가 | `gemini-2.5-flash` | 이 키에서 404 (목록에는 있으나 제공되지 않음) |

  - 응답 시간: 앞쪽 모델이 실패하는 동안의 재시도를 포함해 15~30초 걸린 사례가 있습니다. 추천 모델을 직접 고르면 이 지연을 피할 수 있습니다.
  - 갱신 방법: 설정 탭의 "사용 가능한 모델 불러오기"로 목록을 확인하고 짧은 호출로 시험한 뒤, 결과가 달라지면 관찰일과 함께 이 표를 고칩니다.
- **공개 배포 권장 설정**: Vercel에 `GEMINI_API_KEY`, `NOTION_*`를 **등록하지 않습니다.** 등록하지 않아도 방문자가 자기 키를 넣으면 모두 동작합니다.
- **Vercel 환경 변수 입력 가이드 (서버가 읽는 변수는 아래 5개뿐, 모두 선택)**: 첫 배포는 **하나도 입력하지 않고** 진행(방문자 BYOK 경로를 그대로 시험하기 위함). `ALLOWED_ORIGINS`는 비워 둠(비우면 같은 도메인 요청만 자동 허용 — 프로덕션·프리뷰·커스텀 도메인에서 모두 동작. 값을 넣으면 그 주소만 허용되어 프리뷰 배포가 막힘). `GEMINI_MODEL`·`NOTION_VERSION`은 비워 둠(자동/기본값). `GEMINI_API_KEY`와 `APP_ACCESS_CODE`는 **운영자 본인이 배포 사이트에서 내 키로 AI를 쓰고 싶을 때만 둘을 함께** 입력(접근 코드는 길고 추측하기 어려운 문자열). `VITE_` 접두사 변수에는 비밀 값을 넣지 않음.
- **Vercel 프로젝트 설정 확인 항목**: Framework Preset = Vite, Build Command = `npm run build`(`tsc && vite build`), Output Directory = `dist`, 패키지 관리자는 `package-lock.json` 기준 npm. 루트의 `pnpm-workspace.yaml`은 Next.js 시절 잔여 파일(내용이 `next` 관련)이라 패키지 관리자 판별에 혼선을 줄 가능성이 있으나 **영향은 확인하지 못함** — 빌드가 실패하면 먼저 의심.
- **운영자 본인 테스트**: 로컬 `.env.local`에 `GEMINI_API_KEY`와 `APP_ACCESS_CODE`를 두고 쓰면 키 입력 없이 AI를 시험할 수 있습니다. 개발 서버는 OS 환경 변수도 읽는다는 점에 주의하세요.
- **방문자 비밀 값의 취급**: 키·토큰은 방문자 브라우저에만 있고(기본 `sessionStorage`, 탭을 닫으면 삭제 / "계속 기억하기" 체크 시에만 `localStorage`), 호출 때만 서버를 **한 번 통과**합니다. 서버는 저장·로그를 하지 않고 응답에도 싣지 않으며, 호출 대상 호스트를 `generativelanguage.googleapis.com`·`api.notion.com`으로 고정해 임의 주소 호출(SSRF)을 막습니다. 서버 운영자가 코드를 바꾸면 통과하는 값을 볼 수 있다는 구조적 한계가 있으므로 화면에 고지합니다.
- **남용 방지**: 출처 검사, 요청 크기 제한(60KB), IP별 호출 제한(서버리스 인스턴스별 best-effort). 방문자 키는 방문자 본인의 한도를 쓰므로 운영자 한도는 소진되지 않습니다.
- **보안 헤더**: `vercel.json`이 CSP(스크립트는 같은 출처만 허용), `X-Frame-Options`, `Referrer-Policy: no-referrer`, HSTS, `/api/*` 캐시 금지를 적용합니다. 배포 후 응답 헤더로 반영 여부를 확인하세요.
- 노션 쪽 준비(방문자 안내): 내부 통합을 만든 뒤 **해당 DB에서 "연결"로 그 통합을 추가**해야 합니다(안 하면 404). 권한은 "콘텐츠 읽기"만으로 충분합니다.
- 로컬 개발: `npm run dev`가 같은 핸들러로 `/api/*`를 처리합니다.

### Neon DB 연결 (사용자 결정 2026-11-06 · 연결 완료, 스키마 적용 완료 — 앱은 계정 기능에서 사용, 배포 전)

**연결 결과 (2026-11-06, Vercel CLI로 진행)**
| 항목 | 내용 |
| :--- | :--- |
| 리소스 | `career-intelligence-db` (Neon, 상태 Available), 프로젝트 `career-intelligence`(스코프 `finnekims-projects`, Hobby)에 연결 |
| 플랜·지역 | `free_v3`(무료), `iad1`(미국 동부, 라이브 함수와 같은 지역) |
| 옵션 | `auth=false`(Neon 관리형 로그인은 쓰지 않음 — Better Auth를 직접 설치해 사용), `realtime=false`, 환경 Production·Preview·Development 전부 |
| 주입된 환경 변수 (이름만, 16개) | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL_NO_SSL`, `POSTGRES_PRISMA_URL`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `PGHOST`, `PGHOST_UNPOOLED`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `NEON_PROJECT_ID` |
| 연결 시험 | 로컬에서 `vercel env run`으로 비밀 값을 파일에 쓰지 않고 주입해 `select 1` 수준 질의만 전송: HTTP 200, 데이터베이스 `neondb`, Postgres 18.6, 737ms(절전 후 첫 응답 포함 가능). 데이터 읽기·쓰기 없음 |
| 앱 반영 | 마이그레이션 0001~0003 적용(테이블 18개 + `schema_migrations`), 앱은 `DATABASE_URL`과 `BETTER_AUTH_SECRET`이 모두 있을 때만 계정 기능에서 DB를 사용. 현재 라이브(Vercel) 프로덕션에는 `BETTER_AUTH_SECRET`이 없어 계정 기능이 꺼져 있고 새 코드도 아직 배포 전 |
| 로컬 | `.env.local`에는 `DATABASE_URL`을 넣지 않음(`--no-env-pull`). 필요하면 `vercel env run -- <명령>`으로 실행 중에만 주입. `vercel link`가 `.env.local`에 `VERCEL_OIDC_TOKEN` 한 줄만 추가함(기존 값 변화 없음, Git 무시) |

**CLI 우회 방법 기록**: 기본 `vercel` 명령은 PC 이름의 한글 때문에 로그인 불가(`ByteString` 오류). 해결: `npx vercel`이 설치하는 JS 버전 CLI(`@vercel/cli-support/dist/vc.js`)를 Node로 직접 실행하면서, 실행 중에만 `os.hostname()`을 영문으로 돌려주는 임시 파일을 `--require`로 로드(시스템 설정 변경 없음, 임시 파일은 저장소 밖). 정식 해결은 PC 이름을 영문으로 바꾸는 것.

**환경 변수 현황(이름만)**: 프로젝트에 `GEMINI_API_KEY`·`APP_ACCESS_CODE`는 **없음**(사용자가 삭제). 단, 현재 라이브 프로덕션 배포는 삭제 이전에 만들어져 `/api/health`가 아직 `llm:true`를 보임. 접근 코드가 없어 운영자 키는 쓰이지 않음(잘못된 본문 시험에서 503 확인). 새 프로덕션 배포가 만들어지면 `llm:false`가 될 것으로 예상(미확인).

**연결 계획·결정 메모 (연결 완료 후 현재 기준으로 정리, 2026-11-06)**
- **결정**: DB는 **Neon(Postgres)** 을 Vercel Marketplace로 연결. 이 단계는 **인프라 연결만**이었고 연결은 끝났음. 계정·저장 범위 설계는 결정이 끝나 `ARCHITECTURE.md` 3-1 ⑥~⑦·3-2와 `DEV_PLAN.md` Phase 7에 정리됨. **연결만 한 DB는 비어 있고 앱이 아직 쓰지 않으므로 "서버에 사용자 데이터를 저장하지 않는다"는 현재 약속은 유지됨.** 실제 저장을 시작하기 전(7-3)에 화면 안내문·개인정보 처리방침을 확정할 것(`PRD`·`IDEA`·`ARCHITECTURE`·`AGENTS`는 "구현 전 계획"으로 반영 완료).
- **연결 경로**: Vercel 대시보드 > 프로젝트 > Storage > Neon 설치 > Free 플랜 > 프로젝트 연결 (Vercel이 환경 변수를 자동 주입). CLI(`vercel integration add neon`) 경로는 기본 명령으로는 막혔으나(PC 이름의 한글 → `vercel login`이 `Cannot convert argument to a ByteString` 오류) 위 "CLI 우회 방법"으로 진행해 연결을 마쳤음.
- **지역**: 라이브 서버 함수는 `iad1`(미국 동부)에서 실행됨(`x-vercel-id: icn1::iad1`) → Neon도 **US East(N. Virginia)** 권장(지연 최소화).
- **환경 변수 주의**: 연결 후 새로 배포해야 적용됨(기존 배포에는 반영되지 않음, Vercel 문서). 변수 이름은 연결 후 CLI로 확인함(위 표, `DATABASE_URL` 포함 16개). 연결 문자열은 비밀 값이므로 `VITE_` 접두사 금지, 서버 함수에서만 읽기, 채팅·GitHub에 노출 금지. 서버리스에서는 풀링(pooled) 연결 문자열 권장(Vercel 문서).
- **로컬 파일 보호**: `vercel env pull`(및 `vercel install`)이 `.env.local`을 덮어쓸 수 있어 `.env.local.backup-20261106`을 만들어 둠(Git 무시 대상, 원본과 동일 확인). 로컬 개발용 연결 문자열은 `.env.local`에 넣지 않고 `vercel env run -- <명령>`으로 실행 중에만 주입(2026-11-06 연결 시험에서 사용, 값은 출력하지 않음).
- **Neon 무료 범위(공식 가격·플랜 페이지 2026-11-06)**: 프로젝트당 1GB, 월 100 CU-hours, 데이터 전송 월 5GB, 브랜치 10개, 복구 이력 최대 6시간, 5분 미사용 시 자동 절전(다음 요청에서 깨어남). 한도 소진 시 컴퓨트가 정지되고 데이터는 삭제되지 않음.
- **Vercel 무료(Hobby) 한도 요약(공식 문서 2026-11-06)**: 배포당 함수 12개(`api/` 파일 1개=함수 1개, 현재 `account`·`health`·`llm`·`models`·`notion` 5개 — 로컬 코드 기준, 라이브는 배포 전이라 4개), 요청/응답 본문 4.5MB, 실행 300초·메모리 2GB, 크론 하루 1회(시각 오차 ±59분), 하루 배포 100회, 동시 빌드 1개, 환경 변수 합계 64KB. Hobby는 비상업적 개인 용도 전용(광고·결제 등은 Pro 필요). 사용자 결정: 무료 플랜만으로 되는 구조(`DB_IMPLEMENTATION_PLAN.md` 3-1).
- **개발/운영 DB 공용(2026-11-06 사용자 결정)**: 현재 Neon 변수 16개가 Production·Preview·Development에 모두 연결되어 하나의 DB를 공용으로 씀. 안전 규칙은 `DB_IMPLEMENTATION_PLAN.md` G1(가짜 데이터만, `main`만 푸시해 Preview 배포 방지, 공개 전 재평가).

## 계정·동기화 기능 배포 전 점검표 (2026-11-06 작성, 아직 배포하지 않음)
1. **환경 변수**: `BETTER_AUTH_SECRET`(무작위 32바이트 이상)을 Vercel 프로젝트에 등록해야 계정 기능이 켜집니다. 없으면 `/api/health`의 `accounts`가 `false`이고 계정 패널은 "아직 켜지지 않음"으로 보이며, 앱은 지금처럼 로컬로만 동작합니다(안전한 기본값). `DATABASE_URL`은 Neon 연동이 이미 주입함.
2. **DB**: 마이그레이션 0001~0003은 공용 Neon DB에 이미 적용됨(`scripts/db-migrate.ts`, 체크섬 기록). 새 마이그레이션은 데이터가 생긴 뒤에는 "앞으로 가는 수정" 파일만 추가하고 DOWN은 쓰지 않습니다.
3. **함수 개수**: `api/` 6개(account·health·llm·models·notion·read-url) / 무료 한도 12개. `/api/account/*`는 `vercel.json` rewrite(`/api/account?p=:path*`)로 `api/account.ts` 하나가 처리합니다 — 라이브에서의 동작은 **배포 후 확인 필요**.
4. **배포 직전 점검**: `vercel env run -- npx vite-node scripts/release-check.ts`(읽기 전용, 8항목).
5. **공용 DB 방침(G1)**: 공개 전 사용자 데이터 0건 확인(위 점검에 포함), 공개 후에는 시험을 로컬 가짜 DB(PGlite)로만 하고 실제 DB에는 시험 계정을 만들지 않거나 시험 후 삭제.
6. **공개(기능 켜기) 전 필수**: 개인정보 처리방침 법률 검토·확정(`docs/PRIVACY_POLICY_DRAFT.md`), Vercel Hobby 비상업 조건 확인, 새 화면 직접 확인, 한도(Neon CU-hours·전송량, Vercel 배포 횟수) 점검 방법 정하기.
7. **롤백**: Vercel 대시보드에서 이전 배포로 되돌리기(일반 기능, 이번에 문서로 확인하지 않음). DB 변경은 되돌리지 않고 호환되는 수정 마이그레이션으로 처리.
