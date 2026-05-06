# jaewoomade Design System (jm)

> 여러 프로젝트에서 재사용할 휴대용 React + Tailwind 디자인 시스템.
> shadcn/ui 와 공존 가능 — 토큰·prefix·디렉토리 모두 격리되어 있음.

**Showcase**: [`/jm`](http://localhost:3000/jm) 라우트에서 모든 컴포넌트의 시각·상태·variant 확인.

---

## 1. 철학

### 1.1 무엇을 위한 것인가
- **POS**, ERP 신규 페이지, 그리고 미래의 **다른 프로젝트** 모두에서 같은 컴포넌트를 쓰기 위함.
- 토큰만 바꾸면 매장별 브랜딩(검정 → 그린 등)이 한 줄로 바뀜.
- 라이트/다크 테마 자동 대응.

### 1.2 원칙
1. **포터블 (Portable)** — `src/jm/` 폴더가 자기 안에서만 import. 프로젝트 코드(`@/lib/*`, `@/components/ui/*`) 절대 안 씀.
2. **토큰 우선 (Token-first)** — 모든 색·radius·shadow·font 가 `--jm-*` CSS 변수. Tailwind 임의값(`bg-[var(--jm-surface)]`)으로 참조.
3. **격리 (Isolated)** — `[data-jm-scope]` 안에서만 토큰 활성. 이 wrapper 밖 ERP/shadcn 토큰과 충돌 0.
4. **단순함 (Simple)** — 불필요한 props 금지. 사용처가 3곳 미만이면 추상화하지 않음.
5. **명시적 prefix (Explicit prefix)** — 모든 컴포넌트 `Jm*`. 호출부에서 즉시 출처 식별.

### 1.3 안 하는 것
- 너무 많은 variant. (ex: button variant 6개로 충분, 12개는 과함)
- 비즈니스 로직. (ex: combobox 가 API 호출 안 함, items props 만 받음)
- 프로젝트 종속 (ex: `@/lib/api-client` import 금지).
- 다크 모드 자동 강제. host 가 명시적으로 `theme` 지정.

---

## 2. 디렉토리 구조

```
src/jm/
├── tokens.css                # CSS 변수 (light + dark 토큰)
├── lib/cn.ts                 # clsx + tailwind-merge (자체 보유)
├── theme/
│   ├── scope.tsx             # JmScope wrapper
│   └── toggle.tsx            # JmThemeToggle
├── ui/                       # 모든 primitive
│   ├── button.tsx            # JmButton
│   ├── card.tsx              # JmCard 외
│   ├── input.tsx             # JmInput
│   ├── ...
│   └── index.ts              # barrel
├── index.ts                  # 루트 barrel — `import { JmButton } from "@/jm"`
└── DESIGN.md                 # ← 이 파일
```

**규칙**:
- 모든 import: `@/jm/...` 또는 `@/jm` (barrel)
- 새 컴포넌트는 `src/jm/ui/<name>.tsx`, prefix `Jm*`, `index.ts` 에 export 추가
- 외부 의존성: `react`, `react-dom`, `@base-ui/react`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` (peer)
- 선택적 peer: `react-day-picker` + `date-fns/locale/ko` (DateRangePicker), `sonner` (Toaster)

---

## 3. 빠른 시작

### 3.1 새 페이지에서 사용
```tsx
import "@/jm/tokens.css"; // 한 번만 로드 (보통 layout)
import { JmScope, JmButton, JmCard, JmCardContent } from "@/jm";

export default function Page() {
  return (
    <JmScope theme="light"> {/* "light" | "dark" | "auto" */}
      <JmCard>
        <JmCardContent>
          <JmButton>저장</JmButton>
        </JmCardContent>
      </JmCard>
    </JmScope>
  );
}
```

### 3.2 다른 프로젝트로 이식
1. `src/jm/` 폴더 통째로 복사
2. `package.json` 에 peer 추가:
   ```
   @base-ui/react, lucide-react, clsx, tailwind-merge, class-variance-authority
   ```
3. Tailwind 4 설정 OK (특별 설정 불필요 — 임의값만 씀)
4. 호스트 layout 에서 `import "@/jm/tokens.css"` + `<JmScope>` wrap

---

## 4. 토큰 레퍼런스

`[data-jm-scope]` 안에서 활성. 모두 `--jm-*` prefix.

### 4.1 표면 (Surfaces)
| 토큰 | 용도 |
|---|---|
| `--jm-bg` | 페이지 배경 (가장 옅음) |
| `--jm-surface` | 카드·시트·드로워 표면 |
| `--jm-surface-muted` | 테이블 헤더, 비활성 배경, hover bg |
| `--jm-surface-subtle` | 더 미세한 보조 (구분 안 띄게) |

### 4.2 보더 (Borders)
| 토큰 | 용도 |
|---|---|
| `--jm-border` | 기본 보더 |
| `--jm-border-strong` | 포커스·hover 강조 |

### 4.3 텍스트 (Text)
| 토큰 | 용도 |
|---|---|
| `--jm-text` | 본문 |
| `--jm-text-muted` | 보조 라벨, 메타 |
| `--jm-text-subtle` | 플레이스홀더, 비활성 |
| `--jm-text-disabled` | 비활성 텍스트 |

### 4.4 액션 (CTA)
| 토큰 | 용도 |
|---|---|
| `--jm-action` | 주요 버튼 배경 (라이트=검정, 다크=흰색) |
| `--jm-action-fg` | 주요 버튼 텍스트 |
| `--jm-action-hover` / `--jm-action-active` | 상태별 |

### 4.5 시맨틱 (Semantic)
`success` / `warning` / `danger` / `info` 4종, 각각 `-bg` / `-fg` / `-solid` 3가지.
- `-bg` + `-fg` 쌍: 배지·인라인 알림 (옅은 배경 + 진한 텍스트)
- `-solid`: 솔리드 강조 (progress bar, 토스트 아이콘 등)

### 4.6 기타
| 토큰 | 용도 |
|---|---|
| `--jm-ring` | 포커스 링 색 (alpha 포함) |
| `--jm-shadow-sm/md/lg` | 그림자 3단계 |
| `--jm-radius-sm/md/lg/xl/pill` | 둥글기 |
| `--jm-font-sans` / `--jm-font-mono` | 폰트 스택 |

### 4.7 토큰 커스터마이징
`tokens.css` 의 값을 바꾸거나, host CSS 에서 덮어쓰기:
```css
[data-jm-scope] {
  --jm-action: oklch(0.55 0.20 145); /* 그린 CTA */
  --jm-action-fg: white;
}
```

---

## 5. 컴포넌트 카탈로그

> 모든 컴포넌트의 동작·variant·sizing 은 [`/jm`](http://localhost:3000/jm) showcase 에서 시각 확인.

### 5.1 레이아웃 (Layout)
| 컴포넌트 | 용도 | 주요 props |
|---|---|---|
| `JmScope` | 토큰 cascade scope | `theme: "light" \| "dark" \| "auto"` |
| `JmCard` (+ Header/Title/Description/Content/Footer) | 카드 surface | — |
| `JmSeparator` | 구분선 | `orientation`, `label` |

### 5.2 액션 (Action)
| | | |
|---|---|---|
| `JmButton` | 기본 버튼 | `variant: cta\|secondary\|outline\|ghost\|danger\|link`, `size: lg\|md\|sm\|xs` |
| `JmIconButton` | 아이콘 단독 | `variant: ghost\|solid\|outline`, `size: sm\|md\|lg` |
| `JmPill` | 필터/세그먼트 토글 | `active`, `size` |
| `JmSegmentedControl` | 작은 토글 그룹 | `options`, `value`, `onChange` |

### 5.3 폼 입력 (Input)
| | | |
|---|---|---|
| `JmInput` | 텍스트 인풋 | `size`, `tone: default\|invalid` |
| `JmNumberInput` | 정수·가격 (콤마 자동, X 버튼) | `value`, `onValueChange`, `thousands`, `prefix`, `suffix` |
| `JmSearchInput` | 검색 인풋 (search icon + clear) | `onClear` |
| `JmTextarea` | 여러 줄 입력 | — |
| `JmSelect` | 드롭다운 (검색 X) | `options`, `value`, `onChange` |
| `JmCombobox` | 검색 가능 드롭다운 (popover) | `items`, `onCreateNew` |
| `JmComboboxModal` | 풀스크린 검색 모달 | 모바일 헤더 검색 |
| `JmComboboxDrawer` | 바텀시트형 검색 (가상키보드 안 가림) | dvh 단위로 자동 축소 |
| `JmCheckbox` | `checked` + `indeterminate` | — |
| `JmRadio` / `JmRadioGroup` | 단일 선택 | — |
| `JmSwitch` | on/off | — |
| `JmDateRangePicker` | 기간 선택 (react-day-picker) | `value`, `onChange` |
| `JmFormField` | label + control + hint/error wrapper | `label`, `required`, `hint`, `error` |

### 5.4 데이터 표시 (Display)
| | | |
|---|---|---|
| `JmBadge` | 작은 라벨 | `variant`, `size`, `shape: pill\|square` |
| `JmAvatar` | 이미지 + 이니셜 fallback | `name`, `src`, `size` |
| `JmStat` | KPI 카드 | `label`, `value`, `delta`, `positiveIsGood` |
| `JmTable` (+ Header/Body/Row/Head/Cell) | 리스트 테이블 | — |
| `JmTableToolbar` (+ Search/Filters/Actions) | 테이블 상단 툴바 | — |
| `JmEmpty` | 빈 상태 | `icon`, `title`, `description`, `action` |
| `JmKbd` | 키보드 키 표시 | — |
| `JmSkeleton` | 로딩 자리 표시 | className 으로 폭/높이 |
| `JmSectionLabel` | 섹션 라벨 (uppercase) | — |

### 5.5 네비 (Navigation)
| | | |
|---|---|---|
| `JmTabs` (+ List/Trigger/Indicator/Panel) | 탭 (line / pill variant) | `defaultValue` |
| `JmAccordion` (+ Item/Header/Trigger/Panel) | 접히는 섹션 | — |
| `JmDropdownMenu` (+ Item/Separator/CheckboxItem/RadioItem/Submenu) | 점3개 메뉴 | — |

### 5.6 피드백 (Feedback)
| | | |
|---|---|---|
| `JmAlert` | 인라인 알림 박스 | `variant: info\|success\|warning\|danger\|neutral`, `onDismiss`, `action` |
| `JmTooltip` (+ Provider/Root/Trigger/Content) | 호버 힌트 | `content`, `side` |
| `JmToaster` + `jmToast` | 토스트 (Sonner 래퍼) | `position`, `richColors` |
| `JmProgress` | 결정적 진행 bar | `value`, `tone`, `showLabel` |
| `JmSpinner` | 회전 로딩 | `size`, `tone` |

### 5.7 기타 (Misc)
| | | |
|---|---|---|
| `JmSlider` | 단일/범위 슬라이더 | `value`, `showValue` |
| `JmFilterDropdown` | 다중 선택 필터 dropdown | `options`, `value`, `onChange` |
| `JmDrawer` (+ Content/Header/Body/Footer) | 모달성 사이드/바텀 시트 | `side`, `size`, `dragHandle` |
| `JmDialog` (+ Content/Header/Body/Footer) | 가운데 정렬 모달 | `size: sm\|md\|lg\|xl` |

---

## 5.8 폰트 사이즈 유틸리티

`text-jm-*` Tailwind 유틸리티가 jm 표준 사이즈를 즉시 적용. 픽셀 하드코딩(`text-[14px]`) 대신 사용.

| 유틸리티 | px | line-height | 사용처 |
|---|---|---|---|
| `text-jm-3xs` | 10 | 1.3 | 가장 작은 캡션 |
| `text-jm-2xs` | 11 | 1.4 | 섹션 라벨, 배지, 보조 |
| `text-jm-xs` | 12 | 1.4 | 캡션, 메타 텍스트 |
| `text-jm-sm` | 13 | 1.45 | 본문 sm, 버튼 sm |
| **`text-jm-base`** | **14** | **1.5** | **본문 기본 (default)** |
| `text-jm-md` | 15 | 1.5 | 본문 lg, 인풋 텍스트 |
| `text-jm-lg` | 16 | 1.5 | 시트·다이얼로그 타이틀 |
| `text-jm-xl` | 18 | 1.4 | heading sm |
| `text-jm-2xl` | 20 | 1.35 | heading |
| `text-jm-3xl` | 22 | 1.3 | heading lg |
| `text-jm-4xl` | 26 | 1.2 | KPI 수치 (md) |
| `text-jm-5xl` | 32 | 1.15 | display, KPI 수치 (lg) |

토큰 정의: [globals.css](src/app/globals.css) 의 `@theme` 블록. 다른 프로젝트로 이식 시 이 블록을 함께 복사.

```tsx
// ❌ 픽셀 하드코딩
<p className="text-[14px]">본문</p>

// ✅ 토큰 유틸리티
<p className="text-jm-base">본문</p>
```

font-weight 는 Tailwind 기본 유틸리티(`font-medium/semibold/bold`)를 그대로 사용.

---

## 5.9 페이지 폭 컨테이너 (JmContainer)

페이지 본문은 모니터 폭에 따라 자동 균형이 안 맞아 좌우가 너무 넓어 보일 수 있음.
**`JmContainer` 로 컨벤션화** — 가운데 정렬 + 권장 max-width + 좌우 padding 자동.

```tsx
<JmContainer>{/* 풀폭 — 기본값. POS 정책 통일 */}</JmContainer>
<JmContainer width="default">{/* 1280px — 일반 대시보드 */}</JmContainer>
<JmContainer width="narrow">{/* 768px — 단일 폼, 읽기 위주 */}</JmContainer>
<JmContainer width="compact">{/* 1024px — 좁은 대시보드 */}</JmContainer>
<JmContainer width="wide">{/* 1536px — 큰 테이블, 리포트 */}</JmContainer>
```

| width | 픽셀 | 사용처 |
|---|---|---|
| `full` (기본) | 100% | POS·터치 인터페이스·풀폭 화면 |
| `narrow` | 768 | 단일 폼, 모바일/태블릿 우선 콘텐츠 |
| `compact` | 1024 | 좁은 대시보드, 폼 + 사이드 |
| `default` | 1280 | 일반 대시보드 페이지 (명시 필요) |
| `wide` | 1536 | 데이터 밀도 높은 테이블·리포트 |

**판단 기준**:
- 페이지 콘텐츠가 한 컬럼 위주 (제목 + 본문) → `narrow`
- 카드 그리드 + 사이드 + 본문 → `default` 또는 `wide`
- POS·터치 인터페이스 → `full` (또는 안 씀)

`JmContainer` 는 의미적 wrapper 도 가능 — `as` prop:

```tsx
<JmContainer as="main" width="default">
  <h1 className="text-jm-3xl">대시보드</h1>
  ...
</JmContainer>
```

---

## 6. 결정 트리 — 어떤 컴포넌트를 쓸까?

### 검색·선택
- **옵션 5개 이하 + 검색 불필요** → `JmSelect`
- **옵션 많음 + 검색** → `JmCombobox` (폼 안에 inline)
- **헤더의 글로벌 검색** → `JmComboboxModal` (풀스크린)
- **폼 안인데 모바일 키보드 처리 중요** → `JmComboboxDrawer` (바텀시트, dvh)

### 다이얼로그·시트
- **확인/취소 같은 짧은 모달** → `JmDialog size="sm"`
- **간단한 폼** → `JmDialog size="md"`
- **사이드 패널 (긴 폼)** → `JmDrawer side="right"`
- **모바일 시트 (액션 메뉴, 카트)** → `JmDrawer side="bottom"`
- **풀스크린 검색** → `JmComboboxModal`

### 토글·선택 그룹
- **2~3개 옵션 좁은 영역 (view 토글)** → `JmSegmentedControl`
- **필터 chip (4개 이상)** → `JmPill` 여러 개
- **다중 선택 필터** → `JmFilterDropdown`
- **체크박스 그룹** → `JmCheckbox` 여러 개
- **단일 선택 (정렬·결제수단)** → `JmRadioGroup`
- **on/off (즉시 적용)** → `JmSwitch`

### 알림·피드백
- **사라지는 알림** → `jmToast` (네트워크 결과 등)
- **상시 노출 인라인** → `JmAlert` (재고 부족 안내 등)
- **호버 힌트** → `JmTooltip`

### 로딩
- **버튼 안 / 인라인** → `JmSpinner`
- **카드/리스트 골격** → `JmSkeleton`
- **결정적 진행률 (업로드 등)** → `JmProgress`

---

## 7. 테마

### 7.1 모드
```tsx
<JmScope theme="light" />  {/* 기본 */}
<JmScope theme="dark" />
<JmScope theme="auto" />   {/* prefers-color-scheme */}
```

### 7.2 토글 컴포넌트
```tsx
const [theme, setTheme] = useState<JmTheme>("light");

<JmScope theme={theme}>
  <JmThemeToggle value={theme} onChange={setTheme} />
  ...
</JmScope>
```

### 7.3 다크 토큰 커스터마이징
`tokens.css` 의 `[data-jm-scope][data-jm-theme="dark"]` 블록 수정.

### 7.4 시스템 다크 영구 저장
`localStorage` 또는 cookie 와 결합:
```tsx
const [theme, setTheme] = useState<JmTheme>(
  () => (localStorage.getItem("jm-theme") as JmTheme) ?? "auto"
);
useEffect(() => localStorage.setItem("jm-theme", theme), [theme]);
```

---

## 8. 새 컴포넌트 추가 체크리스트

1. **이름** — `Jm` prefix, PascalCase. 파일은 kebab-case (`jm-foo.tsx` 가 아니라 `foo.tsx`)
2. **위치** — `src/jm/ui/<name>.tsx`
3. **import 제한** — `@/jm/...`, `react`, `@base-ui/react`, `lucide-react`, `clsx`, `tailwind-merge`, `cva` 만. 프로젝트 코드 0
4. **토큰 사용** — 모든 색·shadow·radius 는 `var(--jm-*)`. 하드코딩 금지
5. **`data-jm-scope`** — Portal 로 빠지는 컴포넌트(Popover/Dialog popup) 는 root element 에 `data-jm-scope` 속성 필수 — 그래야 토큰 cascade 안 끊김
6. **font** — Portal popup 은 `font-[family-name:var(--jm-font-sans)]` 도 명시 (cascade 끊김 대비)
7. **`forwardRef`** — DOM 요소를 wrap 하면 ref 전달
8. **`displayName`** — devtools 가독성
9. **export 추가** — `src/jm/ui/index.ts`
10. **Showcase 섹션** — `src/app/(jm)/jm/page.tsx` 에 변형·상태 데모 추가
11. **JSDoc** — 컴포넌트 위에 한 줄 + 사용 예시. 비자명한 의도만 (코드로 자명한 건 안 적음)

---

## 9. Common pitfall — Portal 토큰 cascade

base-ui Popover/Dialog 의 Popup 은 Portal 로 `document.body` 직속에 렌더된다. 그러면 `[data-jm-scope]` 의 자손이 아니므로 `--jm-*` 변수가 cascade 되지 않는다 (= 색·폰트 안 먹음).

**해결**: Popup 자체에 `data-jm-scope` 속성을 다시 부착.
```tsx
<DialogPrimitive.Popup
  data-jm-scope
  className="bg-[var(--jm-surface)] font-[family-name:var(--jm-font-sans)]"
>
```

신규 컴포넌트가 Portal 을 쓴다면 반드시 이 패턴을 적용.

---

## 10. 기존 시스템과의 공존

이 프로젝트(ERP) 안에서 jm 은 다음 두 시스템과 **완전히 격리되어 공존**한다:

| | shadcn (`@/components/ui/*`) | POS (zinc 하드코딩) | jm (`@/jm`) |
|---|---|---|---|
| 변수 prefix | `--primary` `--background` 등 | (없음 — Tailwind zinc-*) | `--jm-*` |
| 격리 attribute | `:root` 전역 | `data-pos-light` | `data-jm-scope` |
| 다크 모드 | next-themes `.dark` 클래스 | 없음 (라이트 강제) | `data-jm-theme="dark"` |
| 사용처 | ERP 대시보드 (legacy) | POS 페이지 | 신규 작업 + 점진 마이그 |

**규칙** (auto-enforce 권장):
- POS 페이지 / 신규 작업 → `@/jm` 만
- shadcn `@/components/ui/*` import 는 ERP 대시보드 라우트 한정
- 둘을 한 컴포넌트 안에 섞지 않음 (시각 충돌)

---

## 11. 마이그레이션: shadcn → jm

| shadcn | jm | 차이 |
|---|---|---|
| `<Button variant="default">` | `<JmButton variant="cta">` | 명명 |
| `<Button variant="outline">` | `<JmButton variant="outline">` | 동일 |
| `<Button variant="destructive">` | `<JmButton variant="danger">` | 명명 |
| `<Badge>` | `<JmBadge>` | shape="pill"/"square" 추가 |
| `<Card>` (+ Header/Title/etc) | `<JmCard>` (+ JmCardHeader/etc) | API 동일 |
| `<Input>` | `<JmInput>` | size prop 추가 |
| `<Sheet>` | `<JmDrawer>` | dragHandle, safe-area 자동 |
| `<Dialog>` | `<JmDialog>` | API 거의 동일 |
| `<Select>` | `<JmSelect>` | options 배열 props (RC node 안 받음) |
| `<Tabs>` | `<JmTabs>` | line/pill variant |
| `<Skeleton>` | `<JmSkeleton>` | 동일 |
| `<Toaster>` (sonner) | `<JmToaster>` | jm 토큰 자동 적용 |

---

## 12. 추출 (Extraction) — 별도 패키지로

이 프로젝트에서 jm 이 안정되면 별도 npm 패키지(`@jaewoomade/ui`) 로 추출 가능:

1. 새 repo 생성, `src/jm/*` 그대로 복사
2. `package.json` 에 peerDependencies 명시 (위 §3.2 참조)
3. tsup / vite 등으로 빌드, types 포함
4. `tokens.css` 는 별도 파일로 export, host 가 명시적 import
5. 호스트 프로젝트는 기존 import 경로(`@/jm`) → `@jaewoomade/ui` 로 교체

추출 시점 결정: 다른 프로젝트가 실제로 같은 컴포넌트를 쓰기 시작할 때. 그 전에는 in-repo 가 더 빠르게 iteration 가능.

---

## 13. 참고

- shadcn/ui — 아키텍처 영감
- vaul — bottom drawer dvh 처리
- base-ui — 모든 headless primitive
- Tailwind 4 — CSS-first, 임의값
