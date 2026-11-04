# v0 프롬프트: Career Intelligence 프론트엔드 UI 프로토타입 생성기

> 아래의 프롬프트 내용 전체(구분선 아래)를 복사하여 **v0 (https://v0.dev)** 입력창에 그대로 붙여넣으세요.  
> 백엔드나 별도 DB 없이, 오직 React + Tailwind CSS + Lucide React + 목(Mock) 상태만으로 완벽히 동작하는 아름다운 단일 페이지 웹 애플리케이션 코드를 생성해 줍니다.

---

### [v0 입력용 프롬프트 전문 시작]

```markdown
Create a complete, responsive, and highly interactive frontend single-page application (SPA) prototype in React (TypeScript) and Tailwind CSS with Lucide React icons. 
No backend server or external database is required—implement all data interactions and state transitions purely on the client side using React `useState` and rich embedded mock data.

---

## 🎯 Project Name: "Career Intelligence"
An intelligent, data-driven career asset management and Job Description (JD) matching analysis platform for tech professionals and AI/data engineers.

---

## 🎨 Design System & Visual Theme
- **Theme**: Modern, clean, dark slate & neutral data-dashboard aesthetic (Tailwind `slate-900` / `slate-800` cards with subtle borders `slate-700`, crisp typography).
- **Accent Colors**: 
  - Brand Primary: Indigo (`indigo-500` / `indigo-600`)
  - Success / Direct Evidence: Emerald (`emerald-500` / `emerald-600`)
  - Transferable / Indirect Evidence: Blue (`blue-500` / `blue-600`)
  - Evidence Gap / Needs Improvement: Amber/Orange (`amber-500` / `amber-600`)
- **Key UX Principle**: 
  - Never display speculative claims like "Pass Rate 85%". 
  - Instead, use objective metrics such as "Requirement Fulfillment: 4 Direct, 2 Indirect, 2 Evidence Gaps".
  - Provide a Fail-Safe UI: If automated link scraping is not supported, provide a friendly toggle to paste raw JD text directly.

---

## 🧭 Navigation Shell (Header & Global Navigation)
- Top Navigation Bar:
  - Left: Logo with Brain/Sparkles icon + "**Career Intelligence**" (Subtext: "Personal Career Asset & JD Intelligence")
  - Center/Right Tabs:
    1. 🏠 **대시보드 (Dashboard)**
    2. 👤 **커리어 프로필 (Profile & Projects)**
    3. 🔍 **채용공고 분석기 (JD Analysis)**
    4. 📋 **지원 트래커 (Application Tracker)**
    5. 🧭 **Career Explorer**
  - Far Right: 
    - Storage indicator badge: "🔒 Local-First (IndexedDB Ready)"
    - ⚙️ **설정 & 백업 (Settings)** icon button
- State: Clicking each tab smoothly switches the visible view using React state (no broken routing).

---

## 📱 Detailed Views & Mock Interactions

### 1. 🏠 대시보드 홈 (Dashboard)
- **Welcome Banner**: "👋 안녕하세요, 이지은님!" with a quick asset summary pill: "프로젝트 4건 · 핵심 기술 태그 8개 · 관심 분야: [AI Applied Engineer]".
- **Quick JD Analysis Input Card**:
  - Input for JD URL (e.g., Wanted, Saramin link) with "🔍 공고 가져오기" button.
  - Expandable toggle button: "▼ [선택] 또는 공고 텍스트 직접 복사/붙여넣기 (Fail-Safe)"
  - When expanded, shows a textarea for raw text pasting.
  - Primary button: "⚡ 지능형 분석 시작하기" (Clicking navigates to the JD Analysis view with prefilled mock data).
- **2-Column Bottom Grid**:
  - Left Column - "📊 최근 지원 파이프라인 현황":
    - Mini progress flow: 준비중(2) ➔ 서류제출(3) ➔ 면접진행(1) ➔ 최종합격(0)
    - Recent 2 application preview cards (e.g. 예시테크 - AI Engineer / 82% 부합 / 1차 면접).
    - Link button: "[ + 전체 지원 트래커로 이동 ➔ ]"
  - Right Column - "🎯 추천 인접 커리어 & 도메인":
    - Recommendations based on user skills (PyTorch, Docker, FastAPI):
      - • AI Applied Engineer (도메인: [소리 & 오디오])
      - • MLOps Engineer (도메인: [미디어 & 생성형 AI])
    - Link button: "[ 🧭 Career Explorer에서 교차 탐색 ➔ ]"

---

### 2. 👤 커리어 프로필 & 프로젝트 자산 (Profile & Projects)
- **2-Column Layout**:
  - **Left Sticky Column (Profile Card)**:
    - User name ("이지은"), Headline ("데이터 중심 실전형 AI 엔지니어"), Target Role ("AI Applied Engineer").
    - Target Domain badges: `[소리 & 오디오]`, `[미디어 & 생성형 AI]`.
    - Key Tech Stack interactive tags: `PyTorch`, `FastAPI`, `Docker`, `ONNX`, `Kubernetes`, `SQL`.
    - Includes an input field to add new tech stack tags on Enter/Comma, and an '✕' button on each tag to remove it.
    - "✏️ 기본 정보 수정" button that opens an edit drawer or inline form.
  - **Right Column (Project Asset Management)**:
    - Search input & tag filter bar + "[ + 새 프로젝트 등록 ]" primary button.
    - List of structured Project Cards containing:
      - Title, Period badge (e.g. "2024.01 ~ 2024.06 (6개월)"), Role badge.
      - Tech Stack tag chips.
      - 1-line description.
      - **🎯 핵심 성과 (Evidence Bullets)**: Distinct bullet points with quantified achievements (e.g. "• ONNX Runtime 양자화로 지연시간 35% 단축 (120ms->78ms)").
      - Project links (GitHub, Tech Blog).
      - Action buttons: "✏️ 수정", "🗑️ 삭제".
- **Modal: Project Add/Edit Form**:
  - Inputs for: Title, Start Date (YYYY-MM), End Date (YYYY-MM), "진행 중(Ongoing)" checkbox.
  - Role input, Tech stack tag input (chips with add/remove).
  - Dynamic Bullet Point list for "핵심 성과": Users can add new bullet input rows or delete rows with a trash icon.
  - Link rows (Title + URL).
  - Save and Cancel buttons updating the local project list state.

---

### 3. 🔍 채용공고 분석기 & Evidence Gap 리포트 (JD Analysis)
- **Top Bar**: Back button, Company & Role ("🏢 예시테크 - AI Applied Engineer (오디오/음성 모델링)"), Analysis Timestamp badge.
- **2-Column Split View**:
  - **Left Column: Structured Job Description (JD Parser Result)**:
    - Company info, Department.
    - Structured sections:
      - 📋 [주요 업무] (Audio synthesis, vocoder model quantization, real-time streaming pipeline)
      - 📌 [자격 요건] (PyTorch 2+ years, Quantization/Pruning experience, low-latency API serving)
      - ⭐ [우대 사항] (Triton/TensorRT, audio signal processing papers)
    - "✏️ 공고 내용 직접 수정하기" button.
  - **Right Column: 3-Stage Intelligent Match & Evidence Gap Report**:
    - Summary Counter Bar:
      - 🟢 **직접 증명 4건** (Direct Evidence from projects)
      - 🔵 **간접 연결 2건** (Transferable skills)
      - 🟠 **증거 공백 2건** (Evidence Gap)
    - Detailed breakdown cards:
      - 🟢 *Direct Evidence*: e.g. "PyTorch 기반 모델링" ➔ Matched with [Project 1] Multimodal Audio Model.
      - 🔵 *Indirect Evidence*: e.g. "대규모 오디오 데이터 파이프라인" ➔ Linked via FastAPI async queue experience.
      - 🟠 *Evidence Gap & Actionable Resume Guide*: 
        - Item: "C++ 기반 실시간 모델 서빙 경험 미증명"
        - 💡 **보완 가이드**: "실무 경험이 없다면 C++ 추론 엔진 스터디나 ONNX C++ 런타임 토이프로젝트 경험을 자기소개서 '학습 민첩성' 항목에 녹여내세요!"
    - Primary CTA Banner:
      - "[ 📥 이 분석 결과를 바탕으로 지원서 등록하기 (스냅샷 저장) ]" (Navigates to Tracker and creates a snapshot record).

---

### 4. 📋 지원 이력 트래커 (Application Tracker)
- **Header**: Search bar, View mode toggle (`▣ 칸반 보드 뷰` / `☷ 테이블 뷰`), and "[ + 새 지원 추가 ]" button.
- **5-Column Kanban Board**:
  1. 준비 중 (In Preparation)
  2. 서류 제출 (Applied)
  3. 면접 전형 (Interviewing)
  4. 최종 합격 (Offer / Accepted)
  5. 불합격 / 보류 (Rejected / On Hold)
- **Application Card**:
  - Company name, Applied position, Application date.
  - Requirement fulfillment badge (e.g. "부합도 82%").
  - Status change dropdown / drag indicator.
  - "[ 📜 스냅샷 열람 ]" button.
- **Modal: Immutable Snapshot Viewer (불변 스냅샷 열람)**:
  - Header with lock icon: "🔒 지원 당시(2026.11.03)의 스냅샷으로, 현재 프로필이 변경되어도 보존됩니다."
  - 3 Tabs inside the modal:
    - **Tab 1: 당시 지원공고(JD) 원문** (Raw preserved text)
    - **Tab 2: 제출 서류(자소서/포트폴리오)** (Resume version, portfolio URL, key highlights)
    - **Tab 3: 당시 Gap 분석 리포트** (Historical 3-stage match result)
  - Bottom memo area for interview retro and status update.

---

### 5. 🧭 Career Explorer (인접 직무 & 도메인 교차 탐색)
- **Header**: "보유 기술(PyTorch, FastAPI, ONNX, Docker)을 바탕으로 인접 직무와 새로운 유망 도메인의 교차 진출 가능성을 탐색합니다."
- **2-Column Layout**:
  - **Left: 4×4 Cross Matrix Grid**:
    - **Rows (Domain 4종)**:
      1. `소리 & 오디오`
      2. `미디어 & 생성형 AI`
      3. `로보틱스`
      4. `헬스케어 & 바이오`
    - **Columns (Role 4종)**:
      1. `AI Engineer`
      2. `AI Applied Engineer`
      3. `MLOps Engineer`
      4. `ML Engineer`
    - Each Cell shows compatibility pills:
      - `[🌟 최적 (Optimal)]`, `[높음 (High)]`, `[보통 (Moderate)]`, `[낮음 (Low)]`
      - Interactive: Clicking a cell selects it and updates the Right Diagnostic Panel.
  - **Right: Selected Role × Domain Deep-Dive Panel**:
    - Title: e.g. "선택: [AI Applied Engineer] × [소리 & 오디오]"
    - Compatibility Score: "88% (🌟 최적 매칭)"
    - 🟢 내 기술과의 접점 (PyTorch, ONNX, 실시간 스트리밍 경험 완벽 부합)
    - 🚀 추천 액션 및 학습 로드맵 (Librosa 오디오 피처 추출 보완, WebRTC 스트리밍 학습)
    - Button: "[ 🔍 이 조합에 맞는 채용공고 분석하러 가기 ➔ ]"

---

### 6. ⚙️ 설정 & 노션 연동 & 데이터 백업 (Settings)
- **2-Column Layout**:
  - **Left: 🔗 노션(Notion) 동적 스키마 어댑터**:
    - Channel selector: "(•) 노션 CSV/JSON 파일 업로드" vs "( ) 노션 공식 API 연동".
    - Drag-and-drop file upload placeholder card with upload icon.
    - Dynamic Property 1:1 Column Mapping Table:
      - [프로젝트명] ⟵ Dropdown: `[ 프로젝트명 (Title) ▼ ]`
      - [기술 스택]  ⟵ Dropdown: `[ 사용기술 (MultiSelect) ▼ ]`
      - [수행 기간]  ⟵ Dropdown: `[ 기간 (Date) ▼ ]`
      - [핵심 성과]  ⟵ Dropdown: `[ 주요성과 (Text) ▼ ]`
    - Button: "⚡ 노션 데이터 가져오기 실행 (시뮬레이션)"
  - **Right: 💾 로컬 퍼스트 백업 & 복원**:
    - Export Box: "📦 전체 데이터 백업 (Export)" ➔ "[ 📥 전체 데이터 JSON 백업 다운로드 ]" button (triggers a mock JSON file download).
    - Import Box: "🔄 백업 파일 불러오기 (Restore)" ➔ File select input and "[ 📂 복원하기 ]" button.
    - Danger Zone: "⚠️ 데이터 초기화" ➔ "[ 🗑️ 로컬 데이터 전체 삭제 ]" button with confirmation alert.

---

## 🛠️ Code Requirements
- Write clean, fully typed React code (TypeScript/TSX).
- Put all views, modals, and tab handlers in place so the whole prototype works seamlessly upon running.
- Include rich initial mock data (e.g. 2+ projects, 4+ applications across kanban columns, 1 sample analyzed JD, full 4x4 matrix data).
- Ensure all interactive elements (modals opening/closing, tags being added/removed, tabs switching, kanban cards moving) work dynamically with React state.
- Make it aesthetically polished, responsive, and production-ready for rapid stakeholder presentation.
```

### [v0 입력용 프롬프트 전문 끝]
