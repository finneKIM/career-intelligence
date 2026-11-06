# 디자인 시스템 (design.md)

이 문서는 **Career Intelligence**의 모든 화면에 걸쳐 일관된 비주얼 톤과 UI 컴포넌트 규격을 정의하는 단일 진실 공급원(SSoT) 디자인 가이드입니다.  
새로운 화면이나 컴포넌트를 추가할 때 반드시 이 문서를 먼저 참조하고 준수합니다.

---

## 1. 디자인 콘셉트 & 철학

### ① 핵심 키워드
> **Intelligence · Analysis · Matching · Broad Exploration**

Career Intelligence는 단순한 이력서 관리 앱이 아닙니다.  
사용자가 자신의 커리어 자산을 **데이터처럼 구조화**하고, 채용 공고를 **정밀 분석**하며, 직무·도메인을 **탐색(Broad)**하는 지능형 플랫폼입니다.

이 콘셉트를 시각적으로 구현하기 위해 다음 세 가지 감성을 디자인에 녹입니다:

| 감성 키워드 | 의미 | 디자인 언어 |
| :--- | :--- | :--- |
| **신뢰(Trust)** | 커리어는 중요한 자산이다 | 차분한 Slate 계열, 단정한 카드 레이아웃, 명확한 위계 |
| **지성(Intelligence)** | 데이터 기반의 객관적 분석 | 대시보드형 정보 배치, 뱃지와 수치 중심의 정보 표현 |
| **탐험(Exploration)** | 새로운 직무·도메인으로 커리어를 넓히다 | Indigo 포인트, 적극적인 CTA 버튼, 매트릭스 UI |

### ② 절대 금지 원칙
- ❌ **합격 확률 과장 금지**: '합격률 85%' 같은 모호한 숫자로 사용자를 오도하지 않습니다.
- ❌ **추측성 역량 판단 금지**: 키워드만 단순 일치했다고 "역량 보유"로 단정 짓지 않습니다.
- ✅ 대신, **직접 증명(Direct) / 간접 연결(Indirect) / 증거 공백(Gap)** 3단계 사실만 제시합니다.

---

## 2. 색상 팔레트 (Color Palette)

### ① 배경 & 중립 계열 (Base / Neutral)

서비스 전체의 배경과 카드, 경계선에 사용합니다. 눈의 피로를 최소화하고 텍스트 가독성을 극대화하는 라이트-슬레이트 톤을 기반으로 합니다.

| 역할 | Tailwind 클래스 | 헥스 코드 | 사용처 |
| :--- | :--- | :--- | :--- |
| 페이지 전체 배경 | `bg-slate-50` | `#F8FAFC` | `<body>`, 메인 콘텐츠 영역 배경 |
| 카드 배경 (메인) | `bg-white` | `#FFFFFF` | 프로필 카드, 프로젝트 카드, 모달 |
| 카드 내 보조 배경 | `bg-slate-50` | `#F8FAFC` | 카드 내 중첩 섹션, 성과 불릿 영역 |
| 경계선 (기본) | `border-slate-200` | `#E2E8F0` | 모든 카드, 입력창, 구분선 |
| 경계선 (강조) | `border-slate-300` | `#CBD5E1` | 호버 시 입력창 강조 |
| 본문 텍스트 | `text-slate-900` | `#0F172A` | 헤딩, 카드 제목, 중요 텍스트 |
| 보조 텍스트 | `text-slate-600` | `#475569` | 설명 문구, 레이블 |
| 비활성 텍스트 | `text-slate-400` | `#94A3B8` | Placeholder, 비활성 아이콘 |
| 헤더 배경 | `bg-white` | `#FFFFFF` | 글로벌 헤더, 내비게이션 바 |
| 개발용 하단 바 | `bg-slate-100` | `#F1F5F9` | Dev 컨트롤 바 (하단) |

### ② 브랜드 & 주 강조 색 (Brand Primary — Indigo)

행동 유도(CTA), 선택 활성화(Active), 핵심 정보 강조에 사용합니다.  
*"지능형 분석을 시작하는 힘"*을 상징합니다.

| 역할 | Tailwind 클래스 | 헥스 코드 | 사용처 |
| :--- | :--- | :--- | :--- |
| 주 버튼 배경 | `bg-indigo-600` | `#4F46E5` | Primary CTA 버튼 |
| 주 버튼 호버 | `bg-indigo-700` | `#4338CA` | Primary 버튼 `:hover` |
| 활성 탭 배경 | `bg-indigo-50` | `#EEF2FF` | 활성 내비게이션 탭 |
| 활성 탭 텍스트 | `text-indigo-700` | `#4338CA` | 활성 탭 레이블 |
| 활성 탭 경계선 | `border-indigo-100` | `#E0E7FF` | 활성 탭 테두리 |
| 태그 칩 배경 | `bg-indigo-50` | `#EEF2FF` | 기술 스택 태그, 활성 필터 칩 |
| 태그 칩 텍스트 | `text-indigo-700` | `#4338CA` | 태그 칩 내 텍스트 |
| 태그 칩 경계선 | `border-indigo-200` | `#C7D2FE` | 태그 칩 테두리 |
| 로고 그라디언트 | `from-indigo-600 to-indigo-500` | — | 헤더 로고 아이콘 배경 |
| 포커스 링 | `ring-indigo-500/20`, `border-indigo-500` | — | 입력창 포커스 상태 |
| 아이콘 강조 | `text-indigo-600` | `#4F46E5` | 카드 내 아이콘 (Sparkles 등) |

### ③ 증거 신호 색 (Evidence Signal Colors)

JD 매칭 분석의 3단계 신호를 직관적으로 전달하는 핵심 시각 언어입니다.  
*신호등처럼 초록→파랑→주황으로 역량 충족도를 즉각 인지시킵니다.*

| 단계 | Tailwind 배경 | Tailwind 텍스트 | 의미 | 사용처 |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 Direct Evidence | `bg-emerald-50`, `border-emerald-200` | `text-emerald-700` | 프로젝트 성과로 직접 증명된 역량 | 매칭 리포트 직접 증거 뱃지 |
| 🔵 Indirect Evidence | `bg-blue-50`, `border-blue-200` | `text-blue-700` | 유사 경험으로 어필 가능한 역량 | 매칭 리포트 간접 연결 뱃지 |
| 🟠 Evidence Gap | `bg-amber-50`, `border-amber-200` | `text-amber-700` | 증거가 부족하여 보완이 필요한 역량 | 매칭 리포트 증거 공백 뱃지 |

### ④ 상태 색 (State Colors)

| 역할 | Tailwind 클래스 | 사용처 |
| :--- | :--- | :--- |
| 성공 / DB 연결 | `bg-emerald-100`, `text-emerald-700` | Local-First 연결 뱃지, 저장 성공 토스트 |
| 경고 / 주의 | `bg-amber-100`, `text-amber-700` | 미완성 프로젝트 경고, 임박 마감 알림 |
| 위험 / 삭제 | `bg-rose-50`, `text-rose-600`, `border-rose-200` | 삭제 버튼, 취소 불가 경고 영역 |
| 대기 / 비활성 | `bg-slate-100`, `text-slate-500` | 미구현 기능 플레이스홀더 뱃지 |

---

## 3. 타이포그래피 (Typography)

기본 폰트는 시스템 UI 폰트(`font-sans`)를 사용합니다. 명시적 폰트 패밀리 임포트 없이 Tailwind 기본 `font-sans` 스택을 따릅니다.

### ① 텍스트 위계

| 수준 | 용도 | Tailwind 클래스 |
| :--- | :--- | :--- |
| **H1 (페이지 타이틀)** | 대시보드 환영 인사, 주요 섹션 타이틀 | `text-xl font-bold text-slate-900` |
| **H2 (카드 타이틀)** | 카드 헤딩, 모달 내 섹션 제목 | `text-base font-bold text-slate-900` |
| **H3 (서브 타이틀)** | 프로젝트 카드 제목 | `text-base font-bold text-slate-900 tracking-tight leading-snug` |
| **Body (본문)** | 카드 내 설명 문구, 프로젝트 개요 | `text-sm text-slate-700 leading-relaxed` |
| **Small (보조 텍스트)** | 날짜, 메타 정보, 레이블 | `text-xs text-slate-500` |
| **Label (입력창 레이블)** | 폼 필드 레이블 | `text-xs font-semibold text-slate-700` |
| **Tag (태그 칩 텍스트)** | 기술 스택 태그, 뱃지 | `text-xs font-medium` |
| **Micro (최소 텍스트)** | ID 표시, 버전 정보 | `text-[11px] text-slate-400` |

### ② 특수 텍스트 처리

| 용도 | Tailwind 클래스 |
| :--- | :--- |
| 코드/DB명 인라인 표시 | `font-mono bg-slate-100 px-1 py-0.5 rounded text-indigo-600 text-xs` |
| 강조 (필수 표시) | `text-rose-500` (별표 `*`) |
| 메타 뱃지 (MVP 등) | `text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full` |

---

## 4. 간격 & 레이아웃 시스템 (Spacing & Layout)

### ① 페이지 그리드

| 항목 | 규격 |
| :--- | :--- |
| 최대 폭 | `max-w-7xl` (1280px) |
| 양쪽 여백 | `px-4 sm:px-6 lg:px-8` |
| 상단 메인 여백 | `py-8` |
| 주요 섹션 간격 | `space-y-6` ~ `space-y-8` |
| 2열 레이아웃 (프로필 화면) | `grid grid-cols-1 lg:grid-cols-12 gap-8` — 좌측 4열 / 우측 8열 |
| 2열 레이아웃 (대시보드) | `grid grid-cols-1 md:grid-cols-2 gap-6` |

### ② 카드 내부 여백

| 카드 크기 | 내부 패딩 |
| :--- | :--- |
| 메인 카드 (대형) | `p-6` |
| 모달 본문 | `p-6 space-y-5` |
| 보조 카드 / 중첩 섹션 | `p-4` |
| 성과 불릿 영역 | `p-3.5` |
| 작은 태그 / 뱃지 | `px-2.5 py-0.5` ~ `px-3 py-1` |

---

## 5. 테두리 & 모서리 반경 (Border & Radius)

| 역할 | Tailwind 클래스 | 적용 대상 |
| :--- | :--- | :--- |
| 메인 카드 | `rounded-2xl border border-slate-200` | 프로젝트 카드, 프로필 카드, 대시보드 카드 |
| 중첩 보조 카드 | `rounded-xl border border-slate-200` | 카드 내 성과 불릿 영역, 안내 박스 |
| 버튼 (Primary) | `rounded-xl` | CTA 버튼 |
| 버튼 (Secondary) | `rounded-lg` | 보조 버튼, 태그 필터 버튼 |
| 태그 칩 | `rounded-md` | 기술 스택 태그 |
| 필 뱃지 (Pill) | `rounded-full` | 상태 뱃지, 미니 카운터 |
| 입력창 | `rounded-lg` ~ `rounded-xl` | 텍스트 인풋, 텍스트에리어 |
| 로고 아이콘 박스 | `rounded-xl` | 헤더 로고 |
| 카드 내 아이콘 박스 | `rounded-lg` ~ `rounded-2xl` | 아이콘 배경 박스 |

---

## 6. 버튼 시스템 (Button System)

### ① Primary CTA 버튼
> 화면당 1개만 사용. 사용자의 핵심 행동을 유도합니다.

```
bg-indigo-600 hover:bg-indigo-700 text-white
rounded-xl px-4 py-2 text-xs font-semibold shadow-sm
transition-colors cursor-pointer
```
- **예시**: `[+ 새 프로젝트 등록]`, `[⚡ 지능형 분석 시작하기]`, `[📥 지원서 등록하기]`

### ② Secondary 버튼
> 보조적 행동. 카드 편집, 필터, 내비게이션 이동 등.

```
bg-slate-100 hover:bg-slate-200 text-slate-700
rounded-lg px-3 py-1.5 text-xs font-medium
transition-colors cursor-pointer
```
- **예시**: `[취소]`, `[샘플 데이터 추가]`, `[Career Explorer에서 탐색하기 ➔]`

### ③ Outline 버튼 (Indigo 테두리)
> 중간 중요도의 행동. 프로필 수정, 뱃지형 액션.

```
bg-indigo-50 hover:bg-indigo-100 text-indigo-700
border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-medium
transition-colors cursor-pointer
```
- **예시**: `[✏️ 수정]`, `[+ 항목 추가]`, `[링크 추가]`

### ④ Danger 버튼
> 삭제, 초기화 등 되돌릴 수 없는 위험 행동. 반드시 확인 알림창과 함께 사용.

```
text-rose-600 hover:bg-rose-50 border border-rose-200
rounded-lg px-2.5 py-1.5 text-xs font-medium
transition-colors cursor-pointer
```
- **예시**: `[🗑️ 삭제]`, `[비우기]`, `[🗑️ 로컬 데이터 전체 삭제]`

### ⑤ 아이콘 전용 버튼 (Icon Button)
> 아이콘만 표시하는 최소 버튼. 카드 액션, 태그 삭제 버튼에 사용.

```
p-1.5 text-slate-400 hover:text-[색상]-600 hover:bg-[색상]-50
rounded-lg transition-colors cursor-pointer
```
- **예시**: 프로젝트 카드의 `[✏️]` `[🗑️]`, 모달 닫기 `[✕]`, 새로고침 `[↺]`

---

## 7. 입력 컴포넌트 (Form Input System)

### ① 텍스트 인풋 (기본)

```
w-full px-3.5 py-2
border border-slate-200 rounded-lg
text-slate-800 placeholder-slate-400 text-sm
focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
transition-all
```

### ② 검색 인풋 (Search Bar)

```
w-full pl-10 pr-4 py-2
bg-slate-50 border border-slate-200 rounded-xl
text-xs text-slate-800 placeholder-slate-400
focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white
transition-all
```
- 좌측에 `<Search>` 아이콘(`w-4 h-4 text-slate-400`)을 절대 위치로 배치합니다.

### ③ 텍스트에리어 (Textarea)

```
w-full px-3.5 py-2
border border-slate-200 rounded-lg
text-slate-800 placeholder-slate-400 text-xs
resize-none
focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500
```

### ④ 비활성(Disabled) 상태

```
disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
```

### ⑤ 태그 칩 인풋 패턴
> 기술 스택 태그처럼 Enter 또는 쉼표 입력 시 태그가 생성되는 패턴.

- **태그 칩 형태**: `bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md px-2.5 py-1 text-xs font-medium`
- 칩 내 삭제 버튼: `<X className="w-3 h-3">` — `hover:text-indigo-900`
- 인풋 Placeholder: `"예: PyTorch, FastAPI, Docker (Enter 또는 쉼표로 추가)"`

---

## 8. 카드 컴포넌트 (Card System)

### ① 메인 콘텐츠 카드

화면 내 주요 정보 블록. 그림자로 배경과의 깊이를 표현합니다.

```
bg-white rounded-2xl border border-slate-200 p-6 shadow-sm
```

### ② 프로젝트 카드 (ProjectCard)

```
bg-white rounded-2xl border border-slate-200 p-6 shadow-sm
hover:shadow-md transition-shadow
flex flex-col justify-between space-y-4
```
- 카드 내 성과 불릿 영역: `bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80`

### ③ 모달 (Modal)

```
// 오버레이
fixed inset-0 z-50 flex items-center justify-center p-4
bg-slate-900/60 backdrop-blur-sm

// 모달 본체
bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200
overflow-hidden flex flex-col max-h-[92vh]

// 모달 헤더
px-6 py-4 border-b border-slate-100 bg-slate-50
flex items-center justify-between

// 모달 본문 (스크롤)
p-6 space-y-5 overflow-y-auto flex-1
```

### ④ 안내 박스 (Info Box)

카드 내에 중요한 맥락을 전달하는 소형 안내 영역.

```
bg-slate-50 p-4 rounded-xl border border-slate-200/80
space-y-1.5
```

---

## 9. 뱃지 & 태그 시스템 (Badge & Tag System)

### ① 상태 뱃지 (Status Badge — Pill 형)

```
inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold
```

| 상태 | 색상 클래스 |
| :--- | :--- |
| 성공 / 연결됨 | `bg-emerald-100 text-emerald-800` |
| 경고 / 대기 | `bg-amber-100 text-amber-800` |
| 미구현 / 준비 중 | `bg-slate-100 text-slate-600` |
| 브랜드 강조 | `bg-indigo-50 text-indigo-700 border border-indigo-200` |

### ② 기간 / 역할 뱃지 (Info Badge)

프로젝트 카드 내 메타 정보 표시용.

```
inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium
```
- 기간: `bg-slate-100 text-slate-500`
- 역할: `bg-indigo-50 text-indigo-700 border border-indigo-100`

### ③ Evidence 3단계 뱃지

JD 매칭 분석 화면에서 역량 충족도를 표현하는 핵심 뱃지.

| 단계 | 아이콘 | 클래스 |
| :--- | :--- | :--- |
| 🟢 직접 증명 (Direct) | `●` or `CheckCircle2` | `bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1 text-xs font-semibold` |
| 🔵 간접 연결 (Indirect) | `●` or `Link2` | `bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-3 py-1 text-xs font-semibold` |
| 🟠 증거 공백 (Gap) | `●` or `AlertCircle` | `bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1 text-xs font-semibold` |

---

## 10. 아이콘 시스템 (Icon System)

전체 아이콘은 **Lucide React** 라이브러리만 사용합니다. 외부 SVG나 이모지 아이콘 단독 사용을 지양합니다.

### ① 아이콘 크기 규격

| 크기 | 사용처 |
| :--- | :--- |
| `w-3 h-3` | 태그 칩 내 삭제 `<X>` |
| `w-3.5 h-3.5` | 소형 아이콘 버튼, 뱃지 내 아이콘 |
| `w-4 h-4` | 내비게이션 탭 아이콘, 카드 액션 버튼 |
| `w-5 h-5` | 헤더 로고 아이콘 |
| `w-7 h-7` | 카드 내 대형 대표 아이콘 |
| `w-8 h-8` | 플레이스홀더 Empty State 아이콘 |

### ② 주요 아이콘 매핑

| 화면 / 기능 | 아이콘 | 색상 |
| :--- | :--- | :--- |
| 로고 / 브랜드 | `Sparkles` | `text-white` (로고 박스 내) |
| 대시보드 탭 | `LayoutDashboard` | 활성: `text-indigo-600` / 비활성: `text-slate-400` |
| 커리어 프로필 탭 | `UserCircle2` | — |
| 채용공고 분석기 탭 | `FileSearch` | — |
| 지원 트래커 탭 | `KanbanSquare` | — |
| Career Explorer 탭 | `Compass` | — |
| 설정 & 백업 | `Settings` | — |
| 프로젝트 추가 | `FolderPlus` | `text-indigo-600` |
| 검색 | `Search` | `text-slate-400` |
| 수정 | `Edit2` / `Edit3` | `hover:text-indigo-600` |
| 삭제 | `Trash2` | `hover:text-rose-600` |
| 모달 닫기 | `X` | `text-slate-400` |
| 성과 불릿 아이콘 | `Sparkles` | `text-indigo-600` |
| 로컬 DB 아이콘 | `Database` | `text-emerald-600` |
| 새로고침 | `RefreshCw` | `text-slate-400` |
| 내보내기 | `Download` | — |
| 가져오기 | `Upload` | — |
| 링크 | `ExternalLink` | `text-indigo-600` |
| 안내/정보 | `Info` | `text-indigo-600` |
| 희망 직무 | `Sparkles` | `text-indigo-600` |
| 관심 도메인 | `Compass` | `text-slate-400` |

---

## 11. 내비게이션 셸 (Global Navigation Shell)

### ① 헤더 구조

```
// 외부 래퍼
bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs

// 내부 최대 폭
max-w-7xl mx-auto px-4 sm:px-6 lg:px-8

// 헤더 상단 행 높이
h-16 flex items-center justify-between

// 내비게이션 탭 행
py-1.5 border-t border-slate-100
```

### ② 로고 블록

```
// 아이콘 박스
w-10 h-10 rounded-xl
bg-gradient-to-tr from-indigo-600 to-indigo-500
flex items-center justify-center text-white
shadow-sm shadow-indigo-200

// 브랜드명
font-bold text-lg text-slate-900 tracking-tight

// 서브텍스트
text-xs text-slate-500
```

**파비콘 (2026-11-05)**: `public/favicon.svg` — 위 로고 블록과 같은 구성(인디고 그라디언트 `#4F46E5` → `#6366F1`, 우상향, 둥근 모서리 약 30% + 흰색 Sparkles). Sparkles 도형은 lucide-react(ISC)에서 가져옴. `index.html`의 `<link rel="icon" href="/favicon.svg">`로 연결. 라이브 반영은 배포 후.

### ③ 탭 버튼 (Active / Inactive)

```
// 활성 탭
bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-100
px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold

// 비활성 탭
text-slate-600 hover:bg-slate-100 hover:text-slate-900
px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold
```

### ④ 우측 상단 유틸리티

```
// Local-First 상태 뱃지
hidden md:inline-flex items-center space-x-1.5 px-3 py-1 rounded-full
text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200

// 펄스 도트
w-2 h-2 rounded-full bg-emerald-500 animate-pulse

// 설정 버튼 (활성)
bg-indigo-50 text-indigo-700 border-indigo-200

// 설정 버튼 (비활성)
bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200
```

---

## 12. Empty State (비어있는 상태 UI)

데이터가 없을 때 사용자에게 다음 행동을 안내하는 중요한 화면입니다.

```
bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm

// 아이콘 박스
w-14 h-14 rounded-2xl bg-slate-100 text-slate-400
flex items-center justify-center mx-auto mb-3

// 타이틀
text-sm font-bold text-slate-700

// 설명
text-xs text-slate-400 mt-1 max-w-sm mx-auto

// CTA 버튼 (첫 등록 유도)
mt-4 inline-flex items-center space-x-1.5 px-4 py-2
bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg
shadow-sm transition-colors cursor-pointer
```

---

## 13. 개발 전용 컨트롤 바 (Dev-Only UI)

개발 및 테스트 목적으로 하단에 고정된 DB 컨트롤 바입니다.  
**프로덕션 배포 시 제거하거나 `isDev` 조건부 렌더링으로 숨깁니다.**
> ✅ **구현 (2026-11-05)**: `import.meta.env.DEV` 조건으로 개발 서버에서만 표시되고 프로덕션 빌드에서는 번들에서도 제거됩니다. 단, 이 수정은 아직 라이브(Vercel)에 반영되지 않아 라이브에서는 반영 전까지 바가 보입니다(`docs/DEPLOY.md` 알려진 결함 ②). 빈 목록일 때만 보이는 온보딩용 "샘플 불러오기" 버튼은 이 바와 별개이며 프로덕션에 남아 있습니다.

```
// 위치: 메인 콘텐츠 최하단, 푸터 바로 위
bg-slate-100/80 rounded-xl border border-slate-200/80
px-4 py-2 flex items-center justify-between
text-xs text-slate-500
```

---

## 14. 반응형 대응 원칙 (Responsive Breakpoints)

| 브레이크포인트 | Tailwind 접두사 | 대응 방식 |
| :--- | :--- | :--- |
| 모바일 (< 640px) | 기본 | 1열 레이아웃, 탭 텍스트 축소 또는 아이콘만 표시 |
| 태블릿 (≥ 640px) | `sm:` | 헤더 서브텍스트 표시, 탭 텍스트 완전 표시 |
| 데스크톱 (≥ 1024px) | `lg:` | 2열 그리드 활성화, Sticky 프로필 카드 |

---

## 15. 애니메이션 & 트랜지션 원칙

- **기본 트랜지션**: 모든 인터랙티브 요소에 `transition-colors` (색상 변화) 또는 `transition-all` (복합 변화) 적용.
- **그림자 애니메이션**: 카드 호버 시 `hover:shadow-md transition-shadow`.
- **로딩 스피너**: `animate-spin` — RefreshCw 아이콘에 적용.
- **Local-First 뱃지 펄스**: `animate-pulse` — 에메랄드 도트에 적용.
- **모달 등장**: `backdrop-blur-sm` — 배경 블러로 집중감 연출.
- **과도한 애니메이션 금지**: MVP 범위에서 `transition-transform`의 복잡한 슬라이드/페이드 애니메이션은 사용하지 않습니다.

---

## 16. 화면별 디자인 패턴 요약 (Quick Reference)

| 화면 | 레이아웃 | 핵심 컴포넌트 | 주요 색상 |
| :--- | :--- | :--- | :--- |
| 🏠 대시보드 | 2열 그리드 (md 이상) | 빠른 분석 입력 카드, 파이프라인 미니 카드, 추천 카드 | Indigo CTA, Emerald 성공 |
| 👤 커리어 프로필 | 4:8 비율 2열 (lg 이상) | Sticky 프로필 카드, 프로젝트 카드 목록, 태그 필터 바 | Indigo 태그, Slate 카드 |
| 🔍 채용공고 분석기 | 1:1 분할 2열 | JD 파싱 뷰, 3단계 Evidence 리포트 패널 | Emerald·Blue·Amber 뱃지 |
| 📋 지원 트래커 | 5열 칸반 / 테이블 뷰 | 칸반 컬럼 카드, 스냅샷 모달 (3탭) | Indigo 활성, Slate 카드 |
| 🧭 Career Explorer | 1:1 분할 2열 | 4×4 교차 매트릭스 그리드, 우측 상세 진단 패널 | 적합도별 Emerald·Amber |
| ⚙️ 설정 & 백업 | 2열 그리드 | 노션 매핑 어댑터 카드, 백업/복원 카드, 위험 영역 | Indigo CTA, Rose 위험 |
