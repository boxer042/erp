@AGENTS.md

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# ERP 프로젝트 가이드

## ⚠️ 작업 영역 분기 — 이 가이드 vs jm 디자인 시스템

이 프로젝트는 **두 개의 UI 시스템이 공존**합니다. 작업 영역에 따라 따를 규칙이 다릅니다.

| 작업 영역 | 따를 규칙 |
|---|---|
| `src/app/(dashboard)/**` (ERP 백오피스) | **이 CLAUDE.md** (shadcn 기반 — 테이블·시트·색상·콤보박스 패턴) |
| `src/app/(pos)/**`, `src/app/(jm)/**`, `src/jm/**` | **`src/jm/DESIGN.md`** + jm primitive 우선 |
| `src/app/(print)/**` | 인쇄 전용 (자체 패턴, 양쪽 시스템 미적용) |
| `src/components/ui/**` | shadcn 컴포넌트 — ERP 한정 사용 |

**다음 키워드가 사용자 요청에 등장하면 jm 룰로 전환**:
- "jm", "JM", "jm 디자인 시스템", "제이엠", "제이엠 디자인 시스템"
- "POS", "포스" 페이지 작업
- 파일 경로가 `src/jm/`, `src/app/(pos)/`, `src/app/(jm)/` 로 시작

**jm 룰 요약** (전체는 [src/jm/DESIGN.md](src/jm/DESIGN.md) 참고):
- 컴포넌트: `JmButton`, `JmCard`, `JmTable`, `JmCombobox`, `JmDrawer` 등 — 모두 `Jm` prefix
- import: `@/jm` 또는 `@/jm/...`. shadcn `@/components/ui/*` import **금지**
- 색상: `var(--jm-*)` CSS 변수만 사용. 하드코딩 zinc-*, hex 금지
- 테마: jm 토큰은 전역 `:root`/`.dark` — 페이지 wrapper 불필요. host 가 `<html>` 에 `.dark` 토글 시 자동 전환. 부분 고정만 `<JmScope theme="light|dark|auto">`
- Portal popup: 토큰이 전역이라 자동 상속 — `data-jm-scope` 재부착 불필요 (남아있어도 무해)

이 분기를 어기면 (POS 에서 shadcn `<Button>` 쓴다든지) **시각 충돌 + 다크 모드 깨짐**. 작업 시작 전 영역 확인 필수.

---

## 기술 스택

- **프레임워크**: Next.js 16.2.1 (App Router, Turbopack)
- **UI**: React 19, Tailwind CSS 4, @base-ui/react, cmdk, lucide-react
- **DB**: PostgreSQL + Prisma 7.5 (@prisma/adapter-pg)
- **인증**: Supabase SSR (@supabase/ssr)
- **데이터 페칭**: @tanstack/react-query 5
- **검증**: Zod 4
- **알림**: Sonner (toast)
- **날짜**: date-fns + react-day-picker
- **폰트**: Pretendard (한국어)

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/             # 로그인/회원가입 (비인증 레이아웃)
│   ├── (landing)/          # 공개 랜딩 (상품 노출)
│   ├── (dashboard)/        # 백오피스 (인증 레이아웃)
│   │   ├── (home)/             # 통합 대시보드
│   │   ├── suppliers/          # 거래처 + ledger
│   │   ├── supplier-products/  # 거래처 상품
│   │   ├── customers/          # 고객(개인/기업) + ledger
│   │   ├── products/           # 판매상품, 세트, 매핑, 카테고리, 브랜드, 스펙슬롯, 조립템플릿
│   │   ├── inventory/          # 재고, 입고, 초기등록, 실사보정, 로트, 반품, 조립
│   │   ├── orders/             # 주문 워크보드
│   │   ├── purchase-orders/    # 발주 (RFQ → 발주 → 입고 흐름)
│   │   ├── quotations/         # 견적서 (판매/매입)
│   │   ├── statements/         # 거래명세표
│   │   ├── tax-invoices/       # 세금계산서 발행 대기열
│   │   ├── sales/              # 판매 이력
│   │   ├── repairs/            # 수리 티켓 + 통계 + 보증
│   │   ├── repair-services/    # 공임 프리셋 / 수리 패키지
│   │   ├── rentals/            # 임대 + 통계
│   │   ├── rental-assets/      # 임대 자산
│   │   ├── serial-items/       # 시리얼 라벨
│   │   ├── expenses/           # 지출
│   │   ├── audit-logs/         # 감사 로그
│   │   ├── reports/margin/     # 마진 리포트
│   │   ├── channels/           # 판매채널 (+ /channels/imports — 외부 채널 import 통합 페이지)
│   │   └── settings/           # 회사정보 · 랜딩 · 미디어
│   ├── (pos)/              # POS (모바일/태블릿 우선) — 자세한 운영 흐름은 [docs/POS.md](docs/POS.md)
│   │       /pos                 손님 그리드
│   │       /pos/customer/[sid]  손님 작업 페이지 (상품/수리/임대)
│   │       /pos/repairs         수리관리 (6섹션)
│   │       /pos/rentals         임대관리 (3섹션)
│   │       /pos/parked          저장된 상담 (장바구니 저장된 PosSession)
│   ├── (print)/            # 인쇄용 — 견적서, 거래명세표, 발주서, 영수증, 시리얼 라벨, 거래처 원장, 수리 영수증
│   ├── repair/approve/     # 손님용 수리 승인 페이지 (토큰 기반, 비인증)
│   ├── api/                # REST API 라우트
│   └── auth/callback/      # Supabase OAuth 콜백
├── components/
│   ├── ui/                          # 기본 UI (shadcn/base-ui 기반)
│   ├── layout/                      # app-sidebar, breadcrumb, dashboard-shell
│   ├── data-table/                  # data-table-toolbar
│   ├── pos/, repair/, assembly/     # POS·수리·조립 도메인 컴포넌트
│   ├── product/, landing/           # 상품 미디어 / 랜딩 블록
│   ├── new-product-form/            # 판매상품 등록 폼 (메인 + parts)
│   ├── providers.tsx                # QueryClientProvider + GlobalLoadingBar
│   ├── global-loading-bar.tsx       # React Query 활동 시 상단 progress
│   ├── quick-register-sheets.tsx    # 거래처/공급상품/판매상품 빠른 등록
│   ├── *-combobox.tsx               # supplier / supplier-product / product / customer / channel / brand / assembly-* combobox
│   ├── mapping-sheet.tsx            # 공급상품→판매상품 매핑
│   ├── quotation-sheet.tsx          # 견적서 등록/수정
│   ├── statement-sheet.tsx          # 거래명세표 등록/수정
│   ├── document-pdf.tsx             # 견적서·거래명세표 react-pdf 렌더러
│   ├── document-print-dialog.tsx    # 인쇄/PDF 다운로드 다이얼로그
│   ├── repair-statement-pdf.tsx     # 수리 영수증 PDF
│   ├── supplier-items-pdf.tsx       # 입고 거래명세표 PDF
│   ├── supplier-ledger-pdf.tsx      # 거래처 원장 PDF
│   ├── shipping-history-card.tsx    # 주문 배송이력 카드
│   ├── *-payment-dialog.tsx         # 거래처/고객 결제 등록
│   ├── *-adjustment-dialog.tsx      # 거래처/고객 잔액 조정
│   ├── media-picker-dialog.tsx, image-edit-dialog.tsx
│   ├── inline-cell-product-search-mobile.tsx
│   └── theme-toggle.tsx
├── lib/
│   ├── prisma.ts, auth.ts, api-auth.ts        # PrismaClient 싱글턴 / requireAuth / guardAdmin
│   ├── constants.ts                           # TAX_RATE, PAYMENT_METHODS, UNITS 등
│   ├── utils.ts                               # cn, formatComma/parseComma, normalizeDiscountInput 등
│   ├── api-client.ts                          # apiGet/apiMutate + ApiError
│   ├── query-keys.ts                          # React Query 도메인별 key factory
│   ├── document-no.ts                         # IN/ORD/QUO/STA/PO 등 문서번호 생성
│   ├── audit.ts                               # 감사 로그 기록
│   ├── inventory/fifo.ts                      # FIFO 로트 소진/복원 공용 헬퍼
│   ├── orders/board.ts                        # 주문 워크보드 분류 로직
│   ├── channels/                              # 외부 채널 — types/import/mock/registry/outbound/suggest
│   ├── repair.ts, repair-inventory.ts         # 수리 합계 계산 / 부속 재고 차감·복원
│   ├── purchase-order.ts                      # 발주 상태 전이 헬퍼
│   ├── customer-ledger.ts, supplier-ledger.ts # 원장 잔액 재계산
│   ├── incoming-recalc.ts, incoming-shipping.ts, cost.ts, cost-utils.ts, selling-cost.ts
│   ├── product-mutations.ts, mapping-helpers.ts
│   ├── card-fee-rate-helper.ts
│   ├── serial-item-code.ts                    # YYMMDD-NNNN 시리얼 코드 발번
│   ├── pdf-fonts.ts, html-utils.ts            # Pretendard 등록 / HTML 변환
│   ├── landing-blocks-utils.ts, landing-export.ts, landing-icons.ts
│   ├── use-body-scroll-lock.ts
│   ├── supabase/                              # client.ts, server.ts, middleware.ts
│   └── validators/                            # Zod 스키마 (product, supplier, order, quotation, statement, repair-ticket, customer, purchase-order, assembly, ...)
└── middleware.ts                              # Supabase 세션 관리
```

## ⚠️ 필수 코드 패턴 (신규/수정 시 반드시 준수)

> 아래 패턴은 2026-04 코드 최적화에서 정착시킨 것. 새 페이지/컴포넌트/API 라우트를 만들거나 기존 파일을 수정할 때 **항상 이 패턴을 따를 것**. 위반 시 곧장 기술 부채가 누적됨.
>
> **⚠️ 영역별 적용 범위**:
> - **§1 (React Query) / §3 (Prisma N+1)**: 모든 영역 공통 — jm/POS 에서도 동일하게 적용
> - **§2 (큰 파일 분리)**: 모든 영역 공통
> - **§4 (테이블 — shadcn `<Table>`)**: ERP 대시보드 한정. POS/jm 에선 `JmTable` 사용 — [DESIGN.md](src/jm/DESIGN.md#5-컴포넌트-카탈로그) 참고
> - **§5 (로딩 상태 UI)**: 패턴은 공통이나 컴포넌트가 다름 — jm 에선 `JmSkeleton` / `JmSpinner` 사용

### 1. 클라이언트 데이터 페칭 — React Query + apiGet/apiMutate

**원시 `fetch()`로 클라이언트 컴포넌트에서 직접 호출 금지.** 반드시 `useQuery`/`useMutation` + [src/lib/api-client.ts](src/lib/api-client.ts) 헬퍼를 사용한다.

```tsx
// ✅ 올바른 패턴
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

const queryClient = useQueryClient();

const itemsQuery = useQuery({
  queryKey: queryKeys.suppliers.list({ search }),
  queryFn: () => apiGet<Supplier[]>(`/api/suppliers?search=${encodeURIComponent(search)}`),
});

const deleteMutation = useMutation({
  mutationFn: (id: string) => apiMutate(`/api/suppliers/${id}`, "DELETE"),
  onSuccess: () => {
    toast.success("삭제되었습니다");
    queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
  },
  onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
});
```

```tsx
// ❌ 금지 — 로딩/에러/캐시 무효화 직접 관리
const [items, setItems] = useState([]);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetch("/api/suppliers").then(r => r.json()).then(d => { setItems(d); setLoading(false); });
}, []);
```

**규칙**:
- query key는 반드시 [src/lib/query-keys.ts](src/lib/query-keys.ts)에 도메인별 factory로 추가 (인라인 배열 금지)
- mutation 후에는 `queryClient.invalidateQueries({ queryKey: queryKeys.<domain>.all })`로 일괄 무효화
- `apiGet<T>(url, schema?)` — 두 번째 인자에 Zod 스키마 넘기면 응답 자동 검증 + 타입 추론 (가능하면 사용)
- 에러 핸들링은 `err instanceof ApiError ? err.message : "기본 메시지"` 패턴
- 폼 등록/수정 직후 부모 리스트 갱신은 콜백(`onCreated`, `onUpdated`)에서 `invalidate()` 호출

### 2. 큰 파일 분리 — 같은 폴더에 _types/_helpers/_parts 추출

페이지나 컴포넌트가 **800줄 넘으면 즉시 분리**. 새 추상화 만들지 말고 **기존 파일을 자르기만** 한다. 분리 단위:

| 파일 | 들어갈 내용 |
|---|---|
| `_types.ts` | interface, type alias, 도메인 상수, label 매핑 (CATEGORY_LABELS, statusLabels 등) |
| `_helpers.ts` | 순수 함수 유틸 (계산식, 포맷터, 변환 함수) |
| `_parts.tsx` | 자체 완결된 sub-component (Combobox, DateInput, Field 등 — 부모 state 의존 없음) |

**컴포넌트 폴더 패턴** (메인 파일이 라우트가 아닌 경우):
```
src/components/new-product-form.tsx       # 메인 컴포지션 (state 보유)
src/components/new-product-form/
├── types.ts                              # 도메인 타입 + 빈 행 팩토리
└── parts.tsx                             # Field, GroupHeader, ToggleGroup, CostList 등
```

**라우트 폴더 패턴** (`(dashboard)/foo/page.tsx` 인 경우):
```
src/app/(dashboard)/inventory/incoming/
├── page.tsx                              # 메인 페이지
├── _types.ts                             # 언더스코어 prefix → Next.js 라우트 무시
├── _helpers.ts
└── _parts.tsx
```

**금지**:
- 27개 useState를 `useReducer`로 통합하는 식의 광범위한 상태 리팩토링은 **단위 테스트 갖춰진 뒤에만** 시도. 회귀 위험 매우 큼
- 부모와 state를 공유하는 sub-component를 별도 파일로 빼서 props drilling 늘리는 행위 금지

### 3. Prisma N+1 쿼리 절대 금지

루프 내부에서 Prisma 호출하면 거의 항상 N+1. **반드시 batch 패턴 사용**:

```typescript
// ❌ 금지 — 품목 N개마다 쿼리 (N+1)
for (const item of items) {
  const sp = await tx.supplierProduct.findUnique({ where: { id: item.spId } });
  // ...
  await tx.supplierProduct.update({ where: { id: item.spId }, data: { ... } });
}

// ✅ 올바른 패턴 — 1회 일괄 조회 + 메모리 처리 + 병렬 update
const ids = Array.from(new Set(items.map((i) => i.spId)));
const sps = await tx.supplierProduct.findMany({
  where: { id: { in: ids } },
  select: { id: true, unitPrice: true },
});
const spById = new Map(sps.map((sp) => [sp.id, sp]));

const ops: Promise<unknown>[] = [];
for (const item of items) {
  const sp = spById.get(item.spId);
  if (!sp) continue;
  if (/* 조건 */) {
    ops.push(tx.supplierProduct.update({ where: { id: item.spId }, data: { ... } }));
  }
}
await Promise.all(ops);
```

**규칙**:
- 같은 종류 row 여러 건 생성 → `createMany` 사용 (lotConsumption 등)
- 같은 종류 row 여러 건 update → `Promise.all`로 병렬 (각 update가 다른 데이터일 때)
- 모든 row 같은 값으로 update → `updateMany`
- `findMany({ where: { id: { in: [...] } } })`로 한 번에 가져온 뒤 `Map`으로 lookup
- 트랜잭션 내부 의존성이 있는 순차 호출(`update` → 결과로 `create`)은 어쩔 수 없이 직렬. 단, **품목 루프 내부의 독립적인 findMany/update는 항상 batch 가능**
- N+1을 새로 도입하는 코드는 PR 단계에서 막기. 기존 N+1 발견 시 즉시 수정

### 4. 테이블 — 가로 스크롤은 shadcn `<Table>` 컴포넌트로 통일

> **⚠️ ERP 대시보드(`(dashboard)/`) 한정.** POS/jm 영역에선 `JmTable` 사용 (`@/jm`). API 거의 동일하지만 토큰·스타일이 jm 시스템.

**모든 리스트성 테이블은 반드시 shadcn `<Table>` 컴포넌트 사용.** 네이티브 `<table>` 요소 직접 사용 금지.

**왜?** shadcn `<Table>`은 내부에 `<div className="relative w-full overflow-x-auto">` wrapper를 포함하고 있어 OS 기본 가로 스크롤바를 자동으로 제공함. 이게 shadcn 공식 컨벤션. 네이티브 `<table>` + `<ScrollArea>` 조합을 쓰면 ScrollArea의 둥근 검은 스크롤바와 OS 기본 스크롤바가 페이지마다 섞여 일관성이 깨짐.

```tsx
// ✅ 올바른 패턴 — 컬럼 많은 리스트
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

<div className="flex h-full flex-col">
  <DataTableToolbar ... />
  <div className="flex-1 overflow-y-auto">          {/* 세로 스크롤만 부모가 담당 */}
    <Table className="min-w-[1100px]">              {/* 가로는 Table 내부 wrapper가 담당 */}
      <TableHeader>
        <TableRow>
          <TableHead>이름</TableHead>
          <TableHead className="text-right">금액</TableHead>
          ...
```

```tsx
// ❌ 금지 — 네이티브 <table> + ScrollArea 조합
<ScrollArea className="flex-1">
  <table className="w-full min-w-[1100px]">
    <thead><tr><th>...</th></tr></thead>
```

**규칙**:
- 컬럼이 많아 좁은 화면에서 넘칠 가능성이 있는 모든 리스트는 `<Table className="min-w-[NNNpx]">` 부여 (NNN은 모든 컬럼이 자연스럽게 보이는 최소 폭, 보통 800~1200)
- 부모 스크롤 컨테이너는 `<div className="flex-1 overflow-y-auto">` (세로만, ScrollArea 사용 금지)
- 셀의 커스텀 스타일(`border-r border-border`, `py-1.5 px-2` 등)은 `TableCell`/`TableHead`의 `className`으로 그대로 전달 가능. shadcn 기본 `h-10 px-2` 등과 충돌하면 명시적으로 override (예: `h-auto py-1.5`)
- 타이트한 행에서 hover 효과 끄려면 `<TableRow className="hover:bg-transparent">` 또는 `hover:bg-muted/50` (기본값)

**네이티브 `<table>` 허용 케이스** (현재 컨벤션 유지):
- 거래명세표/견적서/PDF 미리보기 등 인쇄용 도큐먼트 (격자 테두리 정밀 제어 필요)
- Sheet/Dialog 내 인라인 편집 테이블 (Sheet 폭 안에 fit, 가로 스크롤 불필요)
- 카드 내부의 고정 폭 비용/이력 표 (카드 폭 안에 fit)

**ScrollArea 사용 케이스**: 사이드바 같은 vertical-only 영역에만. 가로 스크롤이 필요한 콘텐츠에 ScrollArea를 쓰면 안 됨.

**⚠️ flex-1 ScrollArea / overflow 컨테이너에는 항상 `min-h-0` (또는 `min-w-0`) 동반 의무**:
- `flex-col` 부모 안의 `flex-1` 자식은 기본 `min-height: auto`라 콘텐츠 크기만큼 부풀어 부모 경계를 넘김
- 결과: 사이드바/패널이 스크롤되지 않고 하단이 잘림, 또는 페이지 전체가 밀려나는 UI 깨짐
- 해결: `<ScrollArea className="flex-1 min-h-0">`, `<div className="flex-1 overflow-y-auto min-h-0">` 의무
- `flex-row`의 `flex-1` 자식이 콘텐츠로 부풀면 `min-w-0`도 같이 (가로 overflow 방지)
- 일반 규칙: **flex 컨테이너 안에서 자식이 부모를 넘기면 안 되는 모든 상황에 min-h-0 / min-w-0 추가**

```tsx
// ✅ 글로벌 사이드바, 콘텐츠 사이드바, 리스트 페이지 모두 동일
<aside className="flex h-full flex-col">
  <div className="shrink-0">헤더</div>
  <ScrollArea className="flex-1 min-h-0">{/* 메뉴/리스트 */}</ScrollArea>
  <div className="shrink-0">하단 영역</div>
</aside>

// ✅ 좌측 사이드 패널 + 우측 메인이 가로로 배치
<div className="flex h-full">
  <aside className="w-[320px] shrink-0">...</aside>
  <main className="flex-1 min-w-0">{/* 콘텐츠가 길어도 사이드바 영역 침범 안 함 */}</main>
</div>
```

**원장형 페이지의 상단 툴바** (suppliers/ledger, customers/ledger 등): `h-10` 같은 고정 높이 + `flex` 직접 쓰면 모바일에서 콘텐츠가 넘쳐 디자인이 깨짐. **`min-h-10 flex flex-wrap gap-x-4 gap-y-1 py-1`** 패턴으로 자연스럽게 줄바꿈되게 작성. 거래처/고객 요약 영역도 `flex-wrap gap-y-3` 적용.

### 5. 로딩 상태 UI — 통일 규칙

**모든 페이지에 자동 적용**: [src/components/global-loading-bar.tsx](src/components/global-loading-bar.tsx)가 [src/components/providers.tsx](src/components/providers.tsx)에 주입되어 있어 React Query 활동 시 상단에 progress bar가 자동으로 표시됨. 별도 조치 불필요.

**리스트 테이블** — "로딩 중..." 텍스트 금지. **페이지별 전용 스켈레톤 행**을 같은 파일 상단에 작성하고 사용. 공용 추상화 금지 — 실제 셀의 너비/정렬/배지 모양과 어긋나서 layout shift 유발.
```tsx
// ✅ 같은 파일 상단에 페이지 전용으로 정의
function ProductsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>            {/* 상품명 */}
          <TableCell><Skeleton className="h-5 w-20 rounded-md" /></TableCell> {/* SKU Badge */}
          <TableCell className="text-right">                                  {/* 가격 우측 정렬 */}
            <div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>
          </TableCell>
          {/* ... 실제 셀 구조 그대로 */}
        </TableRow>
      ))}
    </>
  );
}

// 사용
{loading ? <ProductsSkeletonRows /> : data.map(...)}
```

**규칙**:
- 우측 정렬 셀 → `<div className="flex justify-end"><Skeleton className="h-4 w-16" /></div>`
- Badge 자리 → `<Skeleton className="h-5 w-12 rounded-full" />` (variant outline은 `rounded-md`)
- 아이콘 버튼(size="icon") → `<Skeleton className="h-8 w-8 rounded-md" />`
- 폭은 실제 콘텐츠 길이와 비슷하게 (`w-32`, `w-20` 등 — `w-full` 절대 금지)

**동적 라우트 (`[id]`, `new` 등)** — 같은 폴더에 `loading.tsx` 작성 의무. **페이지마다 page.tsx의 실제 골격**(KPI 카드 개수, 탭 수, 테이블 컬럼 수)에 맞춰 인라인 작성. 공용 컴포넌트 만들지 말 것.
```tsx
// src/app/(dashboard)/products/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-48" />
      </div>
      {/* 실제 페이지가 KPI 카드 5개 → 5개 만큼 */}
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-3 w-20" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-24" /></CardContent>
          </Card>
        ))}
      </div>
      {/* ... 페이지 실제 구조 그대로 */}
    </div>
  );
}
```

**상세 Sheet/패널 — 클릭 후 fetch 중**:
```tsx
const [detail, setDetail] = useState(null);
const [detailLoading, setDetailLoading] = useState(false);

const open = async (id) => {
  setDetail(null);
  setDetailLoading(true);
  try { /* fetch */ } finally { setDetailLoading(false); }
};

// 렌더
{detailLoading ? <SkeletonBlock /> : !detail ? <EmptyState /> : <DetailContent />}
```
빈 값으로 폼 노출 절대 금지 (사용자가 빈 필드에 입력해 덮어쓰기 사고).

**Mutation 버튼 (useMutation 사용 시 의무)**:
```tsx
// ✅ 단일 동작 버튼
<Button disabled={mutation.isPending}>
  {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
  저장
</Button>

// ✅ 같은 mutation을 여러 행에서 호출 — variables로 진행 중인 행만 표시
<Button
  onClick={() => deleteMutation.mutate(item.id)}
  disabled={deleteMutation.isPending && deleteMutation.variables === item.id}
>
  {deleteMutation.isPending && deleteMutation.variables === item.id ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : (
    <Trash2 className="h-4 w-4" />
  )}
</Button>
```

**차트/리포트** — recharts 영역은 데이터 로드 중 `<Skeleton className="h-64 w-full" />` 등 같은 높이의 스켈레톤으로 자리 차지. 빈 박스 노출 금지.

**금지 사항**:
- ❌ 로컬 `useState<boolean>(loading)`로 페이지 전체 로딩 직접 관리 — `useQuery`의 `isPending`/`isFetching` 사용
- ❌ "로딩 중..." 텍스트 출력 — 모두 Skeleton으로 대체
- ❌ mutation 진행 중 버튼 비활성화 누락 — 다중 클릭/중복 요청 가능

### 6. 페이지 레이아웃 패딩 — 리스트와 상세는 다르게

> **⚠️ jm 디자인 시스템 적용 ERP 페이지(`(dashboard)/orders`, `(dashboard)/purchase-orders`, `(dashboard)/customers` 등) 한정.**
> shadcn 잔존 페이지(suppliers, products 등)는 자체 패턴 유지.

ERP `(dashboard)/` 안에서 jm 으로 만든 페이지는 **리스트 / 상세 두 가지 표준 컨테이너 패턴 중 하나**를 따른다. 새 페이지·상세 페이지를 만들 때마다 임의 값(`p-4`, `max-w-[1280px]` 등)을 새로 적기 금지.

#### 리스트 페이지 (KPI + 테이블 형태) — `(dashboard)/orders`, `purchase-orders`, `customers` 리스트
```tsx
<div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
  <div className="flex w-full flex-col gap-6 p-4">
    {/* KPI grid */}
    {/* JmCard with toolbar + table */}
  </div>
</div>
```
- 외곽: `flex min-h-full flex-col bg-[var(--jm-bg)]`
- 내부: `flex w-full flex-col gap-6 p-4` — **풀폭 + p-4 (16px)**
- 폭 제한 없음 — 테이블이 와이드 모니터에서 자연스럽게 넓어지도록

#### 상세 페이지 (단건 상세 + 액션) — `(dashboard)/purchase-orders/[id]`, `customers/[id]`
```tsx
<div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
  {/* 스티키 헤더 — 페이지 폭 제한 없이 가로 꽉 채움 (액션 버튼 다 보이게) */}
  <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
    <JmIconButton aria-label="뒤로" onClick={...}><ArrowLeft /></JmIconButton>
    <span className="text-jm-base font-semibold">{title}</span>
    <div className="ml-auto flex items-center gap-1.5">{/* 액션들 */}</div>
  </div>

  <JmContainer width="default" padded={false} className="space-y-6 p-6">
    {/* 본문 — KPI / 탭 / 카드들 */}
  </JmContainer>
</div>
```
- 헤더: 페이지 폭 제한 없이 sticky, **`px-6 py-3` (좌우 24px / 상하 12px)**
- 본문: `<JmContainer width="default" padded={false} className="space-y-6 p-6">`
  - `width="default"` = max-w 1280px + 가운데 정렬
  - `padded={false}` 로 컨테이너 기본 padding 끄고 명시적 `p-6` 사용 (24px)
- 폭 제한 1280px — 와이드 모니터에서 시선 이동 부담 줄임

**금지 패턴**:
```tsx
// ❌ 상세 페이지에 리스트용 p-4 사용
<div className="flex w-full max-w-[1280px] flex-col gap-6 self-center p-4">

// ❌ JmContainer 안 쓰고 max-w-[NNNNpx] 직접 박기
<div className="mx-auto max-w-[1280px] p-6">

// ❌ 헤더에 폭 제한 (액션 버튼 가려질 수 있음)
<JmContainer><header>...</header></JmContainer>
```

**판단 기준**:
- KPI + 테이블 위주 (목록·보드) → **리스트 패턴 (`p-4`, 풀폭)**
- 단건 + 헤더 액션 + 탭/카드 (상세·편집·리포트) → **상세 패턴 (스티키 헤더 `px-6 py-3` + `JmContainer p-6`)**

---

## 데이터베이스 스키마

> 정확한 필드는 [prisma/schema.prisma](prisma/schema.prisma) 가 단일 출처. 아래는 도메인별 핵심 모델 + 흐름 요약.

### 인증 / 감사
- **User** — Supabase 연동, ADMIN/STAFF 역할
- **AuditLog** — 주요 mutation 추적 (`/lib/audit.ts` 로 기록)

### 거래처
- **Supplier** — 거래처 (사업자번호, 대표자, 전화, FAX, 이메일, 주소, 결제방식 CREDIT/PREPAID)
- **SupplierContact** — 거래처 담당자 1:N
- **SupplierProduct** — 거래처 공급상품 (품명, 품번, 단위, 단가, 통화)
- **SupplierProductPriceHistory** — 공급상품 단가 변동 이력
- **SupplierLedger** — 거래처 원장 (PURCHASE/PAYMENT/ADJUSTMENT/REFUND)
- **SupplierPayment** — 거래처 결제 기록
- **SupplierReturn / SupplierReturnItem** — 입고 반품. exchangeIncomingId 로 교환 입고 연결

### 고객
- **Customer** — `type` enum (INDIVIDUAL/BUSINESS) — 개인/기업 통합. 기업은 사업자번호·업태·종목·담당자 사용
- **CustomerLedger** — 고객 원장 (SALE/RECEIPT/ADJUSTMENT/REFUND, debit/credit/balance)
- **CustomerPayment** — 고객 입금/수금
- **CustomerRefund** — 고객 환불 내역 (CustomerPayment 의 반대). order/amount/method(CARD_CANCEL/CASH/BANK_TRANSFER/POINTS/OTHER)/refundedAt/memo. PAID 결제건의 반품·취소 시 RefundDialog 에서 입력 → 자동 생성. 잔액 영향 없음 (UNPAID 는 ledger ADJUSTMENT). 같은 주문이 여러 번 부분 환불될 수 있어 1:N
- **CustomerMachine** — 고객이 가져온 기기(브랜드, 모델, 시리얼). 수리 티켓에서 참조
- **CustomerNote** — 고객별 메모/이력

### 상품
- **Product** — 판매상품 (SKU, 바코드, 단위, 세금유형, 판매가, 세트/조립 여부, 카테고리, 브랜드)
- **Brand** — 브랜드 마스터
- **ProductCategory** — 카테고리 (계층형, parentId)
- **ChannelCategoryMapping** — 채널별 카테고리 매핑
- **ProductSpecSlot / ProductSpecValue** — 상품 스펙 슬롯 + 값 (종류·정렬)
- **ProductMapping** — 공급상품 → 판매상품 매핑 (환산비율 conversionRate)
- **SetComponent** — 세트/조립상품 구성 (상위 → 하위, slotLabelId 로 슬롯 식별)
- **ChannelPricing** — 채널별 판매가
- **ProductMedia** — 상품 이미지/영상 (kind, type)

### 재고 (로트 기반 FIFO)
- **Inventory** — 상품별 현재 재고 (수량, 안전재고) / Product 1:1. `avgCost`는 deprecated 캐시값
- **InventoryMovement** — 재고 변동 이력 (INCOMING, OUTGOING, ADJUSTMENT_PLUS/MINUS, SET_CONSUME, SET_PRODUCE, RETURN, INITIAL, STOCKTAKE_PLUS/MINUS, ASSEMBLY_*, REPAIR_*, RENTAL_*)
- **InventoryLot** — 입고/기초/조정으로 생성되는 재고 로트. 필드: `productId`(nullable=오르판), `supplierProductId`, `receivedQty/remainingQty`, `unitCost`, `receivedAt`, `source`(INCOMING/INITIAL/ADJUSTMENT)
- **LotConsumption** — FIFO로 소진한 로트 기록 (`orderItemId` 또는 `repairPartId` ↔ `lotId`). 주문/수리 취소·반품 시 복원

### 입고
- **Incoming** — 입고 전표 (IN[YYMMDD]-[4자리], PENDING→CONFIRMED→CANCELLED). `purchaseOrderId` 로 발주와 연결
- **IncomingItem** — 입고 품목. `purchaseOrderItemId` 로 발주 라인 추적

### 발주 (Purchase Order)
- **PurchaseOrder** — 발주 (PO[YYMMDD]-[4자리]). 흐름: `DRAFT → SENT → CONFIRMED → (PARTIAL → PARTIAL_RESENT → PARTIAL_REACCEPTED → PARTIAL_COMPLETED) → RECEIVED` / `CLOSED`(잔량 포기) / `CANCELLED`. 매입 견적서에서 전환 가능 (`quotationId`)
- **PurchaseOrderItem** — 발주 품목. `receivedQty` 누적 → `quantity` 도달 시 자동 RECEIVED 전이

### 견적서 / 거래명세표
- **Quotation** — 판매(SALES) / 매입(PURCHASE) 통합. 상태: `DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED/CONVERTED`. customer 또는 supplier 1개 연결. 자유 입력 라인(productId 없음) 허용
- **QuotationItem** — 견적 품목 (productId/supplierProductId optional, listPrice/discountAmount/unitPrice/totalPrice)
- **Statement / StatementItem** — 거래명세표 (STA 번호, 발행일). 견적서·주문에서 전환

### 주문 ⚠️ 3축 모델 — 자세한 설계는 [docs/ORDERS_SYSTEM.md](docs/ORDERS_SYSTEM.md) 참고

주문 도메인은 **출고·결제·반품(클레임) 3축**으로 분리되어 있음. 한 축의 상태를 다른 축의 의미로 오인하지 않도록 주의.

- **Order** — 주문 (ORD[YYMMDD]-[4자리]). 교환 새 주문은 원본번호 + `-EX` 접미사
  - **출고 축** `status` (5단계 + 반품 5단계): `PENDING`(주문/접수, 재고 미차감) → `PREPARING`(출고대기, 재고 차감) → `PREPARING_PACKED`(출고확정, 송장) → `SHIPPED`(배송중) → `COMPLETED`(배송완료) · 반품/교환: `RETURN_REQUESTED` → `RETURN_ACCEPTED` → `RETURN_COLLECTED` → `RETURN_INSPECTED` → `RETURNED`/`EXCHANGED` · 종결: `CANCELLED`. 라벨은 channelId/claimType 으로 동적 분기 ("주문/접수", "반품요청/교환요청")
  - **결제 축** `paymentStatus`: `UNPAID`/`PAID`/`REFUND_PENDING`/`PARTIAL_REFUND`/`REFUNDED`/`SALES_CANCELLED` — 외상은 매출 취소(SALES_CANCELLED), 검수 후 환불진행(REFUND_PENDING)
  - **클레임 축** `claimType`(`REFUND`/`EXCHANGE_SAME`/`EXCHANGE_DIFFERENT`) + `claimReason`(`DEFECTIVE`/`DAMAGED_IN_TRANSIT`/`WRONG_ITEM`/`CHANGE_MIND`/`SIZE_COLOR`/`OTHER`) — 손님 의도 + 책임 소재
  - `fulfillmentType`: `PICKUP`(매장 수령, POS 즉시 종결) / `DELIVERY`(자체 배달) / `SHIPPING`(택배). PICKUP 은 워크보드 미노출
  - `expectedShipDate`: 출고 예정일 (DELIVERY/SHIPPING 만). 워크보드의 지연/오늘/이번주 분류
  - `repairTicketId` / `rentalId` (각각 `@unique`) — 수리·임대 결제 1:1 연결
  - `quotationId` — 판매 견적서 전환 시 연결
  - `exchangeOrderId` (`@unique`, self-relation `OrderExchange`) — 교환 발송용 새 주문 link. reverse navigable via `exchangedFromOrders`
  - `recipientName/Phone/shippingAddress`, `trackingCarrier/Number` (택배)
  - 반품 흐름 timestamp: `returnRequestedAt`/`returnAcceptedAt`/`returnRejectedAt`/`exchangedAt` + 자유 메모 `returnReason`
- **OrderItem** — `serviceName`(서비스 라인), `unitCostSnapshot`, `channelCommissionRateSnapshot`, `cardFeeRateSnapshot`, `sellingCostSnapshot`

### POS
- **PosSession** — 카트 세션 (디바이스간 sync). items JSON 저장, customerId optional, label, totalDiscount, shippingCost, quotationFingerprint, deletedAt(soft delete)

### 수리 (Repair)
- **RepairTicket** — 수리 티켓 (`type`: ON_SITE 즉시수리 / DROP_OFF 맡김수리)
  - 상태: `RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP` / `CANCELLED`
  - `approvalToken` — 손님용 승인 페이지(`/repair/approve/[token]`)에서 ON_SITE/REMOTE 승인
  - `cancelReason` enum: CUSTOMER_DECLINED/NO_SHOW, SHOP_GAVE_UP, PARTS_UNAVAILABLE, SOLD_AS_PRODUCT, MISTAKE, OTHER
  - `repairWarrantyMonths/Ends`, `parentRepairTicketId` (재수리)
  - `serialItemId` (시리얼 라벨 연결), `customerMachineId` (등록 기기)
- **RepairPart** — 부속 (재고 차감 + LotConsumption). `status` USED/LOST, `billLost` (LOST 청구 여부)
- **RepairLabor** — 공임
- **RepairLaborPreset** — 공임 프리셋 (자주 쓰는 작업)
- **RepairPackage / RepairPackageLabor / RepairPackagePart** — 수리 패키지 (공임+부속 묶음)

### 임대 (Rental)
- **RentalAsset** — 임대 자산 (assetNo, brand/model/serial, dailyRate/monthlyRate, depositAmount, status: AVAILABLE/RENTED/MAINTENANCE/RETIRED)
- **Rental** — 임대 계약 (RNT 번호, customer 1:N, asset 1:1 동시점). 상태: `RESERVED/ACTIVE/RETURNED/OVERDUE/CANCELLED`. POS 카트에서 발생한 경우 `Order.rentalId` 1:1

### 시리얼 라벨
- **SerialItem** — 코드 `YYMMDD-NNNN`. `source`: SALE(일반 판매) / REPAIR(외부 기기 수리 라벨). productId/displayName 둘 중 하나 필수. 보증/RepairTicket 연결

### 조립 (Assembly)
- **AssemblyTemplate / AssemblyTemplateSlot / AssemblySlotLabel** — 조립 템플릿 (슬롯 라벨로 부속 슬롯 정의)
- **AssemblyPreset / AssemblyPresetItem** — 자주 쓰는 조립 프리셋
- **Assembly / AssemblyComponentConsumption** — 조립 실적 (PRODUCE/DISASSEMBLE). `reverseOfId` 로 분해 추적, `producedLotId` 로 결과 로트 연결

### 판매채널
- **SalesChannel** — 채널 (쿠팡, 네이버, 자사몰, 오프라인 / 수수료율)
- **ChannelFee** — 채널 추가 수수료

### 카드 수수료
- **CardFeeRate** — 사업자 분류별 카드 수수료율
- **CardMerchantInfo** — 카드 가맹점 정보
- **CardCompanyFee** — 카드사별 수수료 오버라이드

### 비용 / 지출
- **IncomingCost** — 입고 비용 (공급상품 기준, PERCENTAGE/FIXED, isTaxable)
- **SellingCost** — 판매 비용 (판매상품 기준, PERCENTAGE/FIXED, isTaxable)
- **Expense** — 일반 지출 (category enum: SHIPPING/RENT/UTILITIES/SALARY/PACKAGING/OFFICE_SUPPLIES/MARKETING/MAINTENANCE/INVENTORY_USAGE/OTHER, supplierId/customerId optional, attachmentUrl)

### 회사 정보 / 랜딩
- **CompanyInfo** — 자사 정보 싱글턴 (id="singleton") — 상호, 사업자번호, 대표자, 전화, 주소 등. 모든 인쇄물(견적서/명세표/발주서/영수증/시리얼 라벨)이 여기서 읽음
- **CompanyBankAccount** — 회사 계좌 (인쇄물에 표시)
- **LandingSettings** — 공개 랜딩(`(landing)/`) 블록 설정

### 주요 관계 / 흐름
- **SupplierProduct → ProductMapping → Product** (환산비율로 단위 변환). ProductMapping 생성 시 해당 공급상품의 오르판 로트(productId=null)를 소급 편입 + Inventory 환산 증가
- **Incoming 확정** → Inventory 증가 + InventoryMovement(INCOMING) + **InventoryLot 생성** (매핑 있으면 productId=mapping.productId, 없으면 오르판) + SupplierLedger(CREDIT일 때) + 연결된 PurchaseOrderItem.receivedQty 누적
- **PurchaseOrder 흐름** — 매입 견적서(`Quotation type=PURCHASE`) → `convert` API 로 PurchaseOrder(DRAFT) 또는 Incoming(직접 입고) 전환. 부분입고는 status PARTIAL → PARTIAL_RESENT/REACCEPTED/COMPLETED 단계 추적
- **Order 생성** (POS 결제 / B2B 수동 / 외부 채널 import / 견적서 전환) → POS PICKUP 결제는 즉시 `COMPLETED` + 재고 차감, POS DELIVERY/SHIPPING 결제는 `PREPARING` + 재고 차감 (워크보드 진입), B2B 수동·외부 import 는 `PENDING` (재고 미차감). 생성 시 `paymentStatus` 자동 산출: `paymentMethod=UNPAID` 또는 미입력은 `UNPAID`, 그 외 `PAID`
- **Order `prepare` 액션** (PENDING→PREPARING) → Inventory 감소 + InventoryMovement(OUTGOING/SET_CONSUME) + **FIFO로 로트 소진 + LotConsumption 생성**. 로트 잔량 부족 시 에러로 차단
- **Order 취소** (`cancel` 액션, PENDING/PREPARING 한정) → CANCELLED. PREPARING이었으면 LotConsumption 역순 복원 + 삭제 + Inventory 복원. `paymentStatus=PAID`였다면 `REFUNDED` 자동 전이
- **Order 반품 흐름** — 3단계 또는 1단계:
  - 3단계 (택배 회수): COMPLETED →`request_return`(claimType+claimReason 입력)→ RETURN_REQUESTED →`accept_return`/`reject_return`/`cancel_return_request`→ RETURN_ACCEPTED →`return`/`exchange`→ RETURNED/EXCHANGED
  - 1단계 (매장 즉석): COMPLETED →`return`→ RETURNED (claimType=REFUND 자동)
  - `return` 시 LotConsumption 역순 복원 + Inventory 복원 + paymentStatus PAID→REFUNDED
  - `exchange` 시 LotConsumption 복원 + Inventory 복원 + **새 주문 자동 생성** (원본번호+`-EX`, claimType=`EXCHANGE_SAME`이면 항목 복제 + paymentStatus=PAID + totalAmount=원본, `EXCHANGE_DIFFERENT`이면 빈 항목 + paymentStatus=UNPAID + totalAmount=0). 양방향 link via `exchangeOrderId`
  - 교환 새 주문은 마진 리포트에서 자동 제외 (`exchangedFromOrders: { none: {} }` 필터) — 매출 중복 방지
- **RepairTicket 부속 추가/삭제** → 재고 차감/복원 + InventoryMovement + LotConsumption (`/lib/repair-inventory.ts`)
- **RepairTicket PICKED_UP** → Order 생성(`repairTicketId` 1:1) + CustomerLedger(SALE) — 결제 처리는 POS 결제 흐름과 동일
- **Rental 임대 시작** → RentalAsset.status=RENTED + (POS 결제면) Order 생성(`rentalId` 1:1)
- **SupplierReturn 확정** → **FIFO로 공급상품 로트 잔량 차감** + Inventory 감소 + SupplierLedger(CREDIT이면 REFUND). exchangeIncomingId 있으면 교환 입고 자동 생성
- **Stocktake(실사보정)** → diff>0 이면 새 ADJUSTMENT 로트 생성 (거래처 선택 필수), diff<0 이면 FIFO로 로트 차감 + Inventory 절대값 설정
- **Quotation `convert` API** ([api/quotations/[id]/convert/route.ts](src/app/api/quotations/[id]/convert/route.ts)) — `target=statement|order|incoming|purchase_order`. SALES → statement/order, PURCHASE → incoming/purchase_order. 자유 입력 라인(productId/supplierProductId 없음)은 order/incoming/purchase_order 전환 거부. 전환 후 원본 status=CONVERTED 락
- **기초등록**(`/inventory/initial`) → SupplierProduct 등록 + INITIAL 로트 생성 (1회성 가드)
- **기초 미지급금**(`/suppliers/initial-balance`) → SupplierLedger(ADJUSTMENT, referenceType=INITIAL_BALANCE) 1회성 가드
- 삭제는 소프트 삭제 (isActive: false)

## API 패턴

```typescript
// Next.js 16 params는 Promise — 반드시 await
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
}
```

- REST 패턴: `/api/[resource]/route.ts` (GET 목록, POST 생성)
- REST 패턴: `/api/[resource]/[id]/route.ts` (GET 상세, PUT 수정, DELETE 삭제)
- 검증: Zod safeParse → 실패 시 `{ error: parsed.error.flatten() }` 반환
- 트랜잭션: `prisma.$transaction(async (tx) => { ... })` 패턴

## UI 컨벤션

> **⚠️ 이 섹션 전체는 ERP 대시보드(`(dashboard)/`) shadcn 기반 한정.**
> POS/jm 영역은 [src/jm/DESIGN.md](src/jm/DESIGN.md) 의 토큰·컴포넌트·시트 패턴 사용.
> 두 시스템의 변수·prefix·디렉토리는 격리되어 있으니 한 컴포넌트 안에 섞지 말 것.

### 테마 색상 (CSS 변수 기반 — 라이트/다크 자동 대응)
- 배경: `bg-background` (메인), `bg-card` (카드), `bg-muted` (테이블헤더·서브배경), `bg-secondary` (강조 배경)
- 사이드바: `bg-sidebar`
- 테두리: `border-border-subtle` (미세 구분선), `border-border` (표준), `border-border-strong` (호버/강조)
- 텍스트: `text-foreground` (기본), `text-muted-foreground` (뮤트)
- 호버: `hover:bg-muted/50`, `hover:bg-muted`
- CTA(주요 액션): `bg-cta text-cta-foreground border-cta-border` (라이트=검정 면, 다크=깊은 검정+흰 테두리)
- 브랜드 그린: `text-primary`, `bg-brand-muted`, `border-primary/40` — **small accent 전용** (링크/배지/포커스 링/얇은 라인)
- **그린은 큰 surface 금지**: `bg-primary` 면에 채우는 패턴 금지. CTA 버튼은 `<Button>` 또는 `bg-cta text-cta-foreground` 사용
- **하드코딩 hex 색상 사용 금지** (`bg-[#...]` 패턴). CSS 변수 토큰만 사용할 것.

### 테이블 (Table)
- **좌우 마진 없음**: 테이블은 컨테이너에 꽉 차게 배치 (부모에 px 없음)
- **구조**: `<div className="flex-1 overflow-auto">` → `<Table>` (래핑 border/padding 없음)
- **TableHead**: `h-9 px-3`, `bg-muted`, `text-muted-foreground text-xs`, 좌측 정렬
- **TableCell**: `px-3 py-2.5`, `text-foreground`, `whitespace-nowrap`
- **TableRow**: `border-b border-border`, `hover:bg-muted/50`
- **인라인 편집 테이블** (초기등록 등): TableCell에 `p-1`로 padding 축소, Input 직접 배치
- **네이티브 table** (입고 거래명세표, Sheet 내 담당자): `<table className="w-full text-sm">` + `bg-muted` 헤더
- **Sheet 내 전폭 테이블**: `-mx-5 border-y`로 Sheet padding 상쇄하여 좌우 꽉 차게
- **Card 내 테이블** (대시보드, 상세 페이지): Card > CardContent 안에 직접 `<Table>` 배치

### 인풋 컨벤션 ⚠️
**정수 금액 입력은 항상 천 단위 콤마 포맷으로 표시한다.** 새 입력 추가 시 반드시 따를 것.

공용 헬퍼는 `src/lib/utils.ts`에서 import (재정의 금지):

```tsx
import { formatComma, parseComma } from "@/lib/utils";

<Input
  type="text"          // ← number 아님 (HTML number는 콤마 비허용)
  inputMode="numeric"  // 모바일 숫자 키패드 유지
  value={formatComma(field)}
  onChange={(e) => setField(parseComma(e.target.value))}
  onFocus={(e) => e.currentTarget.select()}
/>
```

**비용 유형이 FIXED/PERCENTAGE 분기되는 경우** (예: CostList, costForm.value):
```tsx
<Input
  type="text"
  inputMode={costType === "FIXED" ? "numeric" : "decimal"}
  value={costType === "FIXED" ? formatComma(value) : value}
  onChange={(e) => {
    const v = costType === "FIXED" ? parseComma(e.target.value) : e.target.value;
    setValue(v);
  }}
  onFocus={(e) => e.currentTarget.select()}
/>
```

**적용 대상**:
- 판매가, 원가, 마진금액, 금액, 가격, 수수료(원)
- 일반적으로 정수 원(₩) 단위 입력 필드 전체

**미적용**:
- 비율(%), 마진율, 환산비율, 수량 등 소수점 입력 → `type="text" inputMode="decimal"`로 두고 콤마 포맷 미적용
- DB 저장값은 항상 raw digits 문자열 (콤마 없음)

**number input 스피너**: globals.css에서 전역 제거됨 (위/아래 화살표 표시 안 함)

**onFocus select**: 정수 금액 입력은 항상 `e.currentTarget.select()` 추가해 클릭 시 기존값 자동 선택

### 할인 입력 컨벤션 ⚠️

할인 필드는 **정액("3000")과 비율("10%")을 한 입력에서 혼용**한다. 입력 정규화·표시는 공용 헬퍼(`src/lib/utils.ts`)로 통일:

```tsx
import { normalizeDiscountInput, formatDiscountDisplay } from "@/lib/utils";

<Input
  inputMode={discount.trim().endsWith("%") ? "decimal" : "numeric"}
  value={formatDiscountDisplay(discount)}
  onChange={(e) => setDiscount(normalizeDiscountInput(e.target.value))}
  onFocus={(e) => e.currentTarget.select()}
/>
```

**동작 규칙**:
- `%`로 끝나면 비율 입력 → 0~100% 범위로 클램프, 콤마 없이 저장 (예: `1,000` 뒤에 `%` 붙이면 → `"100%"`)
- 그 외는 정액 입력 → `parseComma` 로 콤마 제거 후 저장, 표시 시 `formatComma`로 천 단위 콤마
- 계산은 `calcDiscountPerUnit(unitPrice, discount)`로 통일

**적용 위치**: 견적서·거래명세표 Sheet, 입고 등록 Sheet (신규 할인 입력을 추가할 때도 반드시 위 헬퍼 재사용)

### 컴포넌트 사용
- **Sheet** (side="right"): 등록/수정 폼 (거래처, 공급상품, 판매상품)
- **Sheet** (side="bottom"): 입고/반품 등록 (거래명세표 형태)
- **Dialog**: 확인 모달, 간단한 입력 (재고 조정, 삭제 확인)
- **ComboboxSelect**: 검색 + 선택 + 없으면 등록 트리거

### Popover/Combobox 레이아웃 시프트 방지 ⚠️

`@base-ui/react` Popover를 Combobox 패턴으로 사용할 때, **`PopoverTrigger`를 직접 full-width 요소로 두지 않으면 팝오버가 열릴 때 주변 레이아웃이 밀리는 문제가 발생한다.** 모든 Combobox는 반드시 아래 구조를 따를 것:

```tsx
// ✅ 올바른 패턴 — relative h-9 래퍼 + max-h-9 box-border overflow-hidden trigger
<div className="relative h-9">
  <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none">
      <span className="truncate">{selected ? selected.name : placeholder}</span>
      <span className="absolute inset-y-0 right-2 flex items-center">
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </span>
    </PopoverTrigger>
    <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
      ...
    </PopoverContent>
  </Popover>
</div>

// ❌ 금지 — PopoverTrigger를 wrapper div 안에 넣거나, 래퍼 없이 직접 배치
<Popover>
  <PopoverTrigger className="flex h-9 w-full ...">  {/* 래퍼 없음 → 레이아웃 시프트 */}
    ...
  </PopoverTrigger>
</Popover>

// ❌ 금지 — wrapper div 안에 PopoverTrigger + 별도 button 분리
<div className="flex h-9 ...">
  <PopoverTrigger className="flex-1 ...">...</PopoverTrigger>
  <button>...</button>  {/* 구조 분리 → 시프트 */}
</div>
```

**핵심 규칙**:
- 바깥 `<div className="relative h-9">` — 고정 높이로 공간 예약
- `PopoverTrigger`에 `max-h-9 box-border overflow-hidden` 필수 — 팝오버 열릴 때 크기 고정
- 아이콘(ChevronsUpDown, X 등)은 `<span className="absolute inset-y-0 right-2 flex items-center">` 안에 배치
- clearable X 버튼도 같은 absolute span 안에 `e.stopPropagation()`으로 처리
- 참고 구현: `src/components/supplier-combobox.tsx`

### Sheet 레이아웃 구조 (bottom Sheet 기준)
모든 bottom Sheet의 등록/수정 폼은 아래 구조를 따른다:
```tsx
<SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
  <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
    <SheetTitle>폼 제목</SheetTitle>
  </SheetHeader>

  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
    <div className="flex-1 overflow-y-auto">
      {/* 본문 내용 (정보 섹션, 테이블 등) */}
    </div>

    {/* 하단 버튼 — 항상 Sheet 하단에 고정 */}
    <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
      <Button type="button" variant="outline" onClick={onClose}>취소</Button>
      <Button type="button" onClick={handleSubmit} disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" /> : null}
        <span>{submitting ? "처리 중..." : "등록"}</span>
      </Button>
    </div>
  </div>
</SheetContent>
```
- 취소/확인 버튼은 반드시 스크롤 영역 밖 하단에 고정
- 버튼 영역: `border-t border-border px-5 py-4 flex justify-end gap-2 bg-background`
- 취소 버튼: `variant="outline"`, 확인 버튼: 기본(brand)

### 텍스트
- 모든 UI 텍스트는 한국어
- 날짜/숫자: `toLocaleString("ko-KR")`
- 통화: `₩` 접두사

### 페이지 레이아웃

대시보드 페이지는 두 가지 패턴 중 하나로 작성. **마진 누락 절대 금지** — 콘텐츠가 화면 가장자리에 붙어 답답해 보이지 않게.

**패턴 A — 기본 테이블 페이지** (suppliers, customers, products 등 shadcn 기반):
```tsx
<div className="flex h-full flex-col">
  <DataTableToolbar ... />              {/* 상단 고정, px-5 py-2.5 */}
  <div className="flex-1 overflow-auto"> {/* 스크롤 영역, padding 없음 — 테이블이 컨테이너 채움 */}
    <Table>...</Table>
  </div>
</div>
```

**패턴 B — 카드 기반 워크보드 페이지** (orders, purchase-orders 등 jm 기반):
```tsx
<div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
  <div className="flex w-full flex-col gap-6 p-4">  {/* ⚠️ p-4 마진 필수, gap-6 으로 카드 간격 */}
    {/* KPI grid, 메인 카드, ... */}
  </div>
</div>
```

⚠️ **신규 페이지 만들 때 자주 누락되는 부분**:
- **외곽 마진 (`p-4` 또는 `p-5`)** — 이게 없으면 페이지 콘텐츠가 가장자리에 붙어 답답함. 주문(`p-4`)·발주·도움말 페이지 모두 이 마진 사용.
- **루트 배경 (`bg-[var(--jm-bg)]`)** — jm 페이지면 필수. 다크 모드 대응.
- **카드 간격 (`gap-6`)** — 여러 카드 세로 배치 시.
- **콘텐츠 폭 제한 (`max-w-4xl mx-auto` 등)** — 도움말·설정 같은 long-form 페이지는 폭 제한해 가독성 확보.

체크리스트 (신규 페이지 만들기 전 확인):
1. 루트 `flex min-h-full flex-col bg-[var(--jm-bg)]` (jm) 또는 `flex h-full flex-col` (shadcn) 적용했나?
2. 콘텐츠 wrapper 에 `p-4` 또는 `p-5` 마진 줬나?
3. 여러 섹션 있으면 `gap-6` 또는 `space-y-6` 으로 간격 줬나?
4. 폼·문서형 페이지면 `max-w-3xl` ~ `max-w-5xl` + `mx-auto` 로 폭 제한했나?

- 루트: `flex h-full flex-col` (브라우저 높이 사용)
- 콘텐츠: `flex-1 overflow-auto` (남은 공간 채움 + 스크롤)
- Table 부모에 padding 없음 (테이블 자체가 컨테이너 꽉 채움)

### DataTableToolbar
- Props: `search`, `onRefresh`, `onAdd`, `addLabel`, `filters`, `loading`
- 스타일: `border-b border-border px-5 py-2.5`
- 검색: `max-w-[320px] h-[30px] text-[13px]`
- 버튼: `h-[30px] text-[13px]`
- filters: 검색과 액션 사이에 렌더링

### 버튼 크기
- 툴바: `h-[30px] text-[13px]`
- 테이블 행 액션: `h-7 text-[12px]`
- 기본: `h-8` (default size)
- 아이콘: `size="icon"` (h-8 w-8) 또는 `h-7 w-7 p-0`

### Badge 사용
- `variant="outline"` — SKU, 식별자
- `variant="secondary"` — 부가 정보 (단품, 정상)
- `variant="default"` — 중요 상태 (활성, 세트)
- `variant="destructive"` — 경고 (부족, 취소)

### 로딩 상태
> **권위 있는 출처는 위 "필수 코드 패턴 5. 로딩 상태 UI"** — 페이지별 Skeleton 컴포넌트 사용. "로딩 중..." 텍스트 금지.
- 새로고침 아이콘: `<RefreshCw className={loading ? "animate-spin" : ""} />`
- 버튼 진행: `{mutation.isPending ? <Loader2 className="animate-spin" /> : <Icon />}`

### 빈 상태
- `<TableCell colSpan={N} className="text-center py-8">데이터가 없습니다</TableCell>`
- 메시지는 컨텍스트에 맞게: "등록된 거래처가 없습니다", "변동 이력이 없습니다" 등

### 탭 (커스텀 구현)
```tsx
<div className="flex h-[30px] rounded-md border border-border bg-card text-[13px]">
  <button className={tab === "a" ? "bg-secondary text-foreground" : "text-muted-foreground"}>...</button>
</div>
```

## 폼 패턴

### 상태 관리
- 단일 객체 state: `const [form, setForm] = useState(emptyForm)`
- 업데이트: `setForm({ ...form, [field]: value })` 또는 `setForm(prev => ({ ...prev, ... }))`
- 숫자 필드는 string으로 저장, API 전송 시 `parseFloat()` 변환

### 가격/숫자 표시
- 표시: `₩{parseFloat(value).toLocaleString("ko-KR")}`
- Prisma Decimal → JSON string → `parseFloat()` → `toLocaleString()`

### 날짜
- 저장: `"yyyy-MM-dd"` (ISO)
- 표시: `format(date, "yyyy년 M월 d일", { locale: ko })` 또는 `toLocaleString("ko-KR")`
- 직접 입력: YYYYMMDD → `yyyy-MM-dd` 파싱 지원

### 검증
- Zod safeParse — API 측에서 실행
- 실패 시: `NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })`
- 클라이언트: `res.ok` 체크 → `toast.error()`

## 에러/알림 패턴

### Toast
- 성공: `toast.success("거래처가 등록되었습니다")` — 과거형, 한국어
- 실패: `toast.error("저장에 실패했습니다")` — 일반 메시지
- API 에러: `toast.error(typeof err.error === "string" ? err.error : "저장 실패")`

### API 응답 코드
- `200` — 조회/수정 성공
- `201` — 생성 성공
- `400` — 검증 실패 (error.flatten())
- `404` — 찾을 수 없음
- `409` — 중복 (SKU 등)

## 부가세 처리 정책

### 원칙
모든 비용(입고비용, 판매비용, 채널수수료)은 `isTaxable: boolean` 필드로 과세/면세를 구분한다.

- **과세(isTaxable: true)**: 세금계산서 발행 대상 (택배비, 채널 수수료, 포장재 등)
  - 원가 계산 시 공급가액만 반영: `금액 ÷ 1.1`
  - 매입세액 공제 가능
- **면세(isTaxable: false)**: 세금계산서 비발행 (관부과세, 인건비 등)
  - 원가 계산 시 금액 전체 반영

### 원가 계산 공식
```
매입 공급가액 = 공급사 단가 ÷ conversionRate
입고비용(과세) = 비용금액 ÷ 1.1 ÷ conversionRate  (개당 기준)
입고비용(면세) = 비용금액 ÷ conversionRate
실제 원가 = 매입 공급가액 + 입고비용 합계
```

### 단가 부가세 정책 ⚠️ (2026-04 통일)

**모든 상품 가격 필드는 세전(공급가액) 기준으로 저장한다.** VAT 포함 금액은 오직 화면 표시용으로만 `× (1 + taxRate)` 계산.

| 필드 | 의미 | 기준 |
|------|------|------|
| `Product.listPrice` | 공식 판매 정가 | **세전** |
| `Product.sellingPrice` | 실제 판매 단가 (할인 적용 후) | **세전** |
| `SupplierProduct.listPrice` | 공식 매입 정가 | **세전** |
| `SupplierProduct.unitPrice` | 실제 매입 단가 (할인 적용 후) | **세전** |
| `IncomingItem.unitPrice` | 입고 실제단가 (할인 후) | **세전** |
| `IncomingItem.totalPrice` | 공급가액 합계 = unitPrice × qty | **세전** |
| `ChannelPricing.sellingPrice` | 채널별 판매가 | **세전** |
| `OrderItem.unitPrice` / `totalPrice` | 주문 시점 판매가 스냅샷 | **세전** |

**계산 규칙**:
- 세액 = `공급가액 × taxRate` (가산 방식, 역산 금지)
- 화면 표시(VAT 포함) = `공급가액 × (1 + taxRate)`
- 할인액 = `listPrice - sellingPrice/unitPrice` (파생값, 저장 안 함)
- Product `taxType`이 `TAX_FREE`/`ZERO_RATE`일 땐 세액 = 0

**UI 편집 폼의 "VAT 포함/세전" 토글**은 표시 전용. Submit 시 항상 세전으로 환산해 저장 (`toNetPrice` 헬퍼 사용).

## 입고(Incoming) 도메인 규칙

### IncomingItem 필드 의미
| 필드 | 의미 | 비고 |
|------|------|------|
| `originalPrice` | 할인 전 단가 (세전) | nullable — 구버전 데이터는 null |
| `discountAmount` | 개당 할인액 | nullable — 할인 없으면 null 또는 0 |
| `unitPrice` | 실제단가 = 할인 후 단가 (세전) | 항상 세전 공급가액 |
| `totalPrice` | 공급가액 합계 = unitPrice × quantity (세전) | 부가세 미포함 |
| `unitCostSnapshot` | 입고 확정 시점 원가 스냅샷 | 단가 + 배분배송비 + IncomingCost 합산 |

- `totalPrice`는 세전이므로 세액 = `totalPrice × 0.1` (역산 금지)
- 입고가(화면 표시) = `unitPrice × 1.1` (isTaxable일 때)

### 비용 VAT 처리 정책 ⚠️

**입고비용(IncomingCost) / 판매비용(SellingCost) FIXED 항목**은 사용자가 VAT 포함 금액으로 입력한다.
원가 계산 시 `isTaxable === true`이면 반드시 `/ 1.1`로 공급가액 환산:
```typescript
const net = c.isTaxable ? parseFloat(c.value) / 1.1 : parseFloat(c.value);
```
PERCENTAGE 항목은 이미 비율이므로 VAT 변환 불필요.

### 원가 계산 정책 ⚠️ (로트 기반 FIFO)

**실제 원가는 로트(InventoryLot)에서 계산한다.** `Inventory.avgCost`는 기존 UI 호환을 위해 남겨둔 **deprecated 캐시값**이므로 마진 계산·리포트·회계 판단에 사용하지 않는다.

**FIFO 원칙**:
- 입고 확정 → 로트 1건 생성 (`unitCostSnapshot` 기준 `unitCost`)
- 주문 확정 → `receivedAt ASC`로 로트 소진하며 `LotConsumption(quantity, unitCost)` 생성
- `OrderItem.unitCostSnapshot` = `Σ(LotConsumption.quantity × unitCost) / totalQty`
- 주문 취소/반품 → `LotConsumption` 역조회해 `InventoryLot.remainingQty` 복원 + consumption 삭제
- 입고 반품 확정 → 해당 공급상품 로트 FIFO로 `remainingQty` 차감 (잔량 부족 시 에러)
- 실사보정 → diff>0이면 ADJUSTMENT 로트 신규 생성 (unitCost = 현재 잔여 로트 가중평균), diff<0이면 FIFO 차감

| 이벤트 | Inventory.quantity | InventoryLot | LotConsumption |
|--------|--------|--------|--------|
| 입고 확정 | +qty | INCOMING 로트 생성 | — |
| 주문 확정 | -qty | remainingQty FIFO 차감 | 생성 |
| 주문 취소/반품 | +qty 복원 | remainingQty 복원 | 삭제 |
| 입고 반품 확정 | -qty | remainingQty FIFO 차감 | — |
| 실사보정 (+) | 절대값 설정 | ADJUSTMENT 로트 생성 | — |
| 실사보정 (-) | 절대값 설정 | remainingQty FIFO 차감 | — |
| 기초등록 | +qty (매핑 시) | INITIAL 로트 생성 | — |
| ProductMapping 생성 | +qty (소급 환산) | 오르판 로트의 productId 할당 | — |

**마진 리포트 원가** ([api/reports/margin/route.ts](src/app/api/reports/margin/route.ts)):
1. `LotConsumption`이 있으면 `Σ(quantity × unitCost)`를 사용 (FIFO 실제값)
2. 없으면 `unitCostSnapshot × quantity`로 폴백 (PR2 이전 주문)

**재고 부족 처리**: `CompanyInfo.allowNegativeStock` 설정으로 분기 (설정 페이지 토글, 기본 ON).
- **OFF**: 주문 확정·POS 결제·수리 부속 차감 시 로트 잔량이 부족하면 에러로 차단. 실사보정으로 재고를 맞춘 뒤 재시도하는 흐름.
- **ON** (기본): 재고가 부족해도 차단하지 않음. 부족분만큼 `fifoConsume` 이 **적자(deficit) 로트**를 생성 — `source=ADJUSTMENT`, `remainingQty` 음수, `unitCost` 는 추정 원가(최근 로트 단가 → 거래처 매입단가 → 0). `Inventory.quantity` 와 Σ`remainingQty` 가 함께 음수로 정합. 추후 재고조정(실사보정)으로 정산. 차단 가드는 `isOversellAllowed()` 로 트랜잭션 진입 전 1회 조회해 `fifoConsume`/`ensureBulkStock` 에 `allowOversell` 로 전달.

### 배송비 VAT 처리 정책 ⚠️
`Incoming.shippingCost`는 사용자가 입력한 **VAT 포함 금액**으로 저장된다.

원가 계산 시 공급가액으로 변환해야 한다:
```
배송비 공급가액 = shippingCost / 1.1   (shippingIsTaxable === true 일 때)
배송비 공급가액 = shippingCost          (shippingIsTaxable === false 일 때)
```

UI에 배송비를 표시할 때도 반드시 같은 변환을 적용해야 한다:
```typescript
// 올바른 표시 — 공급가액 기준
Math.round(avgShippingIsTaxable ? avgShippingCost / 1.1 : avgShippingCost)

// 잘못된 표시 — VAT 포함 금액 그대로 노출 (원가보다 크게 보임)
Math.round(avgShippingCost)
```

### 배송비 배분 정책
배송비는 **금액 비례 배분**으로 각 품목에 할당한다:
```
해당품목 배분 배송비 = (품목 totalPrice / 전체 totalPrice 합계) × 전체 shippingCost
배분 비율(%) = (품목 totalPrice / 전체 totalPrice 합계) × 100
```
- 여러 품목이 있을 때 전체 배송비를 금액 비율로 나눔
- 단일 품목이면 100% 그대로 적용
- 배송비 없으면 0

### SupplierProduct.listPrice / unitPrice 업데이트 시점
입고 등록(POST) 시:
1. `item.originalPrice`(할인 전 단가)가 있고 기존 `listPrice`와 다르면 → `SupplierProduct.listPrice` 갱신
2. `item.unitPrice`(실제단가, 할인 후)가 기존 `unitPrice`와 다르면 → `SupplierProduct.unitPrice` 갱신
3. 둘 중 하나라도 변경되면 `SupplierProductPriceHistory`에 `oldPrice/newPrice/changeAmount/changePercent` + (추가) `originalPrice`(그 시점 정가), `discountAmount`(개당 할인액) 기록

→ 상세페이지 "입고가"는 항상 **가장 최근 입고의 실제단가 기준**

### 폼 수정 시 빈 값 처리 ⚠️
PUT API 전송 시 빈 문자열 필드를 `|| undefined`로 처리하면 **undefined가 JSON에서 제거**되어 API가 기존값을 유지한다.
빈 값으로 저장해야 하는 필드는 반드시 `?? ""` 또는 `?? null`로 명시적으로 전달할 것:
```typescript
// 잘못된 예 — 빈 문자열이 전달되지 않아 기존값 유지됨
spec: editForm.spec || undefined

// 올바른 예 — 빈 문자열도 그대로 전달됨
spec: editForm.spec ?? ""
```

## 한국어 IME 입력 주의사항 ⚠️

한국어 키보드로 텍스트 입력 중 Enter 키를 누르면 마지막 글자가 조합 완료되기 전 이벤트가 발생해 **마지막 글자가 잘린 채로 처리**된다.

`onKeyDown`에서 Enter를 처리하는 모든 곳에 반드시 `isComposing` 체크를 추가할 것:
```typescript
onKeyDown={(e) => {
  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
    // 처리
  }
}}
```
적용 위치: 검색 입력, 인라인 등록 트리거, 빠른 등록 Combobox 등 Enter로 액션을 트리거하는 모든 입력 필드

## 네이밍 규칙

- **컴포넌트**: PascalCase (`QuickSupplierSheet`)
- **변수/함수**: camelCase (`handleSubmit`, `fetchSuppliers`)
- **상수**: UPPER_SNAKE_CASE (`PAYMENT_METHODS`, `DEFAULT_TAX_RATE`)
- **타입**: PascalCase (`SupplierFormData`)
- **UI 텍스트**: 한국어 / **코드 변수**: 영어

## Import 순서

1. React 훅 (`useEffect`, `useState`, `useCallback`, `useRef`)
2. Next.js (`next/link`, `next/navigation`)
3. UI 컴포넌트 (`@/components/ui/*`)
4. 기타 컴포넌트 (`@/components/*`)
5. 아이콘 (`lucide-react`)
6. 유틸리티 (`sonner`, `@/lib/*`)

모든 import는 `@/` 경로 별칭 사용 (상대 경로 사용 금지)

## DB 관리

```bash
# 스키마 변경 후
npx prisma db push        # DB에 직접 반영
npx prisma generate       # Prisma Client 재생성
rm -rf .next              # Next.js 캐시 정리 (필요 시)
```

## 공통 컴포넌트

### quick-register-sheets.tsx
거래처/공급상품/판매상품 빠른 등록 Sheet. 여러 페이지에서 재사용:
- `QuickSupplierSheet` — 거래처 페이지, 초기등록, 입고, 상품등록
- `QuickSupplierProductSheet` — 초기등록, 상품등록
- `QuickProductSheet` — 초기등록

수정 시 모든 사용처에 자동 반영됨.

### supplier-combobox.tsx ⚠️ 거래처 선택 시 반드시 사용
거래처를 선택하는 모든 곳에서 **`<Select>` 대신 반드시 이 컴포넌트를 사용**한다.
- 이름/사업자번호 실시간 검색
- 없는 거래처 입력 시 `"검색어" ↵` 버튼 → `onCreateNew` 콜백 → `QuickSupplierSheet` 연동
- IME(한국어) 안전하게 처리

```tsx
import { SupplierCombobox } from "@/components/supplier-combobox";

<SupplierCombobox
  suppliers={suppliers}           // { id, name, businessNumber? }[]
  value={selectedSupplierId}
  onChange={(id, name) => { ... }}
  onCreateNew={(name) => {
    setQuickSupplierDefaultName(name);
    setQuickSupplierOpen(true);
  }}
/>
```

사용처: 초기등록(`/inventory/initial`), 상품등록 Sheet(`/products`)

### supplier-product-combobox.tsx ⚠️ 공급상품 선택 시 반드시 사용
거래처 공급상품을 선택하는 모든 곳에서 **`<Select>` 대신 반드시 이 컴포넌트를 사용**한다.
- 품명/품번(`supplierCode`) 실시간 검색
- 없는 공급상품 입력 시 `"검색어" ↵` 버튼 → `onCreateNew` 콜백 → `QuickSupplierProductSheet` 연동
- 선택 시 전체 sp 객체 전달 (단가/단위 자동 채움 가능)
- IME(한국어) 안전하게 처리

```tsx
import { SupplierProductCombobox } from "@/components/supplier-product-combobox";

<SupplierProductCombobox
  supplierProducts={supplierProducts}  // { id, name, spec?, supplierCode?, unitPrice, unitOfMeasure }[]
  value={mapping.supplierProductId}
  onChange={(sp) => setMapping((prev) => ({ ...prev, supplierProductId: sp.id }))}
  onCreateNew={(name) => {
    setQuickSupplierProductDefaultName(name);
    setQuickSupplierProductOpen(true);
  }}
/>
```

사용처: 상품등록 Sheet(`/products`)

### FieldRow (Sheet 내부 폼 행)
```tsx
<FieldRow label="거래처명" required>
  <Input ... />
</FieldRow>
```
- `grid grid-cols-[120px_1fr]` 레이아웃, 라벨 우측 정렬

## PDF 생성 (견적서·거래명세표)

### 아키텍처
- PDF 렌더러: `@react-pdf/renderer` (HTML 캔버스 캡처 방식이 아닌, React primitives → PDF 직접 렌더링)
- 진입 컴포넌트: `src/components/document-pdf.tsx` 의 `DocumentPdf`
- 폰트 등록: `src/lib/pdf-fonts.ts` 에서 `Font.register` 1회 호출 (import 부수효과로 실행)
- 폰트 파일: `public/fonts/Pretendard-Regular.ttf`, `public/fonts/Pretendard-Bold.ttf`
  - Pretendard npm 패키지 기본 디렉토리는 `.otf` 이지만 **react-pdf 는 OTF 미지원** → `node_modules/pretendard/dist/public/static/alternative/` 의 `.ttf` 를 복사해 사용

### 렌더링 흐름
1. `src/app/(print)/quotations/[id]/print/page.tsx` 또는 `.../statements/[id]/print/page.tsx` (서버 컴포넌트)
2. Prisma 로 데이터 로드 → 클라이언트 `DocumentPdf` 로 props 전달
3. 기본: `<PDFViewer>` 로 브라우저 내장 뷰어에 임베드
4. `?auto=1` 쿼리: 마운트 직후 `pdf(doc).toBlob()` → `URL.createObjectURL` → `window.location.href` 로 탭 교체 (목록의 "PDF 다운로드" 버튼 UX)

### 파일명·메타데이터 규칙
- PDF 내부 `<Document title>` 와 브라우저 탭 title 모두 `${supplier.name}_${buyer.name}_${documentNo}` 형식
- 판매 견적서: supplier=우리, buyer=고객 → `우리상호_고객_QUO...`
- 매입 견적서: supplier=거래처, buyer=우리
- 브라우저 "다른 이름으로 저장" 시 이 title 이 기본 파일명으로 제안됨

### 신규 필드 추가 시 주의
- react-pdf 는 `<Table>` primitive 가 없으므로 `<View flexDirection:row>` + 각 셀 `width: "%"` + `borderRightWidth`/`borderBottomWidth` 로 직접 구성
- 셀 style 배열에 `null`/`false` 넣으면 타입 에러 → 빈 객체 `{}` 로 대체
- 한글 폰트는 `fontFamily: "Pretendard"` 필수. 생략 시 기본 폰트로 한글이 □ 로 나옴

### 개발 환경 주의사항 — pako
- `pako@^1.0.11` 를 **top-level dependency 로 명시 설치 필요** (package.json 에 존재)
- `@react-pdf/pdfkit` 의 브라우저 번들이 `pako/lib/zlib/constants.js` 등 내부 서브패스를 직접 import 하는데, npm 의 자동 호이스팅으로는 nested 위치에만 설치되어 Next.js 번들러가 모듈을 찾지 못함
- 증상: `Module not found: Can't resolve 'pako/lib/zlib/constants.js'`
- 해결: `npm install pako@^1.0.11` (버전 2.x 는 서브패스 구조가 바뀌어 호환 안 됨)

## jm 디자인 시스템 (POS / 신규 작업용)

> 전체 가이드: [src/jm/DESIGN.md](src/jm/DESIGN.md). 아래는 빠른 요약.

`src/jm/` 는 **포터블 디자인 시스템** — 이 프로젝트의 POS 와 향후 다른 프로젝트에서 재사용. shadcn 과 격리되어 공존.

### 적용 영역
- ✅ `src/app/(pos)/**` — POS 모든 페이지·시트·컴포넌트
- ✅ `src/app/(jm)/**` — 디자인 시스템 showcase
- ✅ `src/jm/**` — primitive 자체
- ✅ 새로 만드는 페이지·기능 (ERP 대시보드 외)
- ❌ `src/app/(dashboard)/**` — 기존 shadcn 유지 (마이그레이션은 점진)

### 핵심 룰
1. **import 격리** — `@/jm` 또는 `@/jm/...` 만 사용. shadcn `@/components/ui/*` import **금지**
2. **컴포넌트 prefix** — 모두 `Jm*` (`JmButton`, `JmCard`, `JmTable`, `JmCombobox`, `JmDrawer`, `JmDialog` …)
3. **토큰만** — 색·radius·shadow·font 모두 `var(--jm-*)`. `zinc-*`, `bg-white`, hex 하드코딩 **금지**
4. **테마** — jm 토큰은 전역 `:root`(light)/`.dark`(dark). 페이지를 감쌀 필요 없이 host 의 `.dark` 클래스(next-themes 등)로 앱 전체 자동 전환. `<JmScope theme>` 는 전역과 다른 테마를 강제하는 부분 영역(island, 예: POS 독립 테마)에만 사용
5. **Portal popup** — 토큰이 전역이라 Portal 도 자동 상속. `data-jm-scope` 재부착 불필요(남아있어도 무해). 폰트만 끊기는 환경이면 popup 에 `font-[family-name:var(--jm-font-sans)]` 명시
6. **새 컴포넌트 추가** — `src/jm/ui/<name>.tsx`, `forwardRef`, `displayName`, `src/jm/ui/index.ts` 에 export, [showcase](src/app/(jm)/jm/page.tsx) 에 데모 섹션. 외부 의존성은 `@base-ui/react`, `lucide-react`, `clsx`, `tailwind-merge`, `cva` 만. 프로젝트 코드(`@/lib/*`, `@/components/ui/*`) import **금지** (포터빌리티 보장)

### 컴포넌트 매핑 (shadcn → jm)

| shadcn | jm | 비고 |
|---|---|---|
| `<Button variant="default">` | `<JmButton variant="cta">` | 명명만 |
| `<Button variant="destructive">` | `<JmButton variant="danger">` | 명명만 |
| `<Card>` | `<JmCard>` | 동일 |
| `<Input>` | `<JmInput>` | size prop 추가 |
| `<Sheet>` | `<JmDrawer>` | side·dragHandle·safe-area 자동 |
| `<Dialog>` | `<JmDialog>` | 동일 |
| `<Select>` | `<JmSelect>` | options 배열 props |
| 검색 select | `<JmCombobox>` (popover) / `<JmComboboxModal>` (풀스크린) / `<JmComboboxDrawer>` (바텀시트, 가상키보드 안 가림) | 컨텍스트별 선택 |
| `<Tabs>` | `<JmTabs>` | line/pill variant |
| `<Skeleton>` | `<JmSkeleton>` | 동일 |
| `<Toaster>` (sonner) | `<JmToaster>` + `jmToast` | jm 토큰 자동 적용 |
| 가격 입력 (콤마 + onFocus select) | `<JmNumberInput>` | **select-all 안 함**, 캐럿 끝으로, X 버튼 |
| label + 인풋 grid 패턴 | `<JmFormField>` | label + hint/error 통합 |

### 폰트
`--jm-font-sans` / `--jm-font-mono` 자동 적용. host 의 `--font-geist-sans`, `--font-pretendard` 사용 (없으면 system-ui 폴백).

### 다크 모드
`<JmScope theme="dark">` 또는 `theme="auto"` (시스템 따라감). POS 는 [PosThemeWrapper](src/app/(pos)/pos/_components/pos-theme-wrapper.tsx) 가 localStorage 영구 저장 + `usePosTheme()` 훅 제공. 메뉴의 `<JmThemeToggle>` 로 토글.

### Showcase
모든 컴포넌트의 시각·variant·상태: [http://localhost:3000/jm](http://localhost:3000/jm)

---

## 후속작업해야할것

### POS 도메인 (자세한 운영 흐름·의도는 [docs/POS.md](docs/POS.md) §9 참고)

(현재 우선순위 작업 없음 — 모두 완료)

### 주문 도메인 (자세한 한계는 [docs/ORDERS_SYSTEM.md §8](docs/ORDERS_SYSTEM.md#8-한계와-후속-작업) 참고)

**우선순위 높음** (외부 채널 가입 후 활성화):
- **외부 채널 Phase 2 — 어댑터 endpoint 채우기** ⏸ 가입 대기: 쿠팡/네이버 어댑터 framework + 인증은 [`src/lib/channels/coupang.ts`](src/lib/channels/coupang.ts) / [`naver.ts`](src/lib/channels/naver.ts) 에 준비됨. 가입 후 환경변수 설정(`COUPANG_*` / `NAVER_*`) → registry 자동 등록 → 메서드 별 TODO endpoint 채움
- **외부 채널 Phase 5 Inbound webhook 핸들러** ⏸ Phase 2 의존: [`/api/webhooks/channels/[code]`](src/app/api/webhooks/channels/[code]/route.ts) 라우트 + 이벤트 dispatch framework 준비됨. 어댑터의 `verifyWebhookSignature` / `parseWebhookEvent` 메서드 구현 + 라우트의 kind 별 처리 로직 채움
- **Solapi 카카오 알림톡 템플릿 매핑** — Solapi 어댑터는 SMS 까지 작동. 카카오 비즈 채널 사전 승인 후 환경변수 (`SOLAPI_KAKAO_TPL_*`) 설정하면 알림톡 자동 활성화. 템플릿 변수는 `payload.meta.kakaoVars` 로 전달 가능
- **참고**: 채널 SKU 가 ERP variant 를 자동 결정하는 매핑은 의도적으로 미구현 — 매장 운영 흐름상 출고대기 진입 시 매장 직원이 직접 변형 선택(POS 와 동일). [_variant-resolve-dialog.tsx](src/app/(dashboard)/orders/_variant-resolve-dialog.tsx) 가 그 UI

### 통합 판매내역 (2026-05-09 jm 리뉴얼 후 남은 항목)

코드 진입점: [src/app/(dashboard)/sales/history/](src/app/(dashboard)/sales/history/) · [src/app/api/sales/history/](src/app/api/sales/history/)

**우선순위 낮음**:
- **사이드바 메뉴 위치 검토** — `/sales/history` 가 "통합 판매내역"이라는 트랜잭션 추적 정체성을 갖게 됨. 현재 sidebar 카테고리(`sales-history`)가 매출 분석/리포트와 같은 그룹에 있는지 — 정책 결정 후 위치 재배치 검토 (다음 사이드바 일괄 정리 batch 에 합류)

### 대시보드 메인 홈 (2026-05-15 jm 리뉴얼 + 정확성·인터랙티브 batch 후 남은 항목)

전체 작업 카탈로그·우선순위·계산식 단일 출처: [docs/DASHBOARD.md](docs/DASHBOARD.md).

**완료** (정확성·인터랙티브·비즈니스 지표·시각화 확장 batch 1~3):
- ✅ 매출 정의 `/sales/history` netAmount 와 동기화 (PARTIAL_REFUND 차감 + REFUNDED/SALES_CANCELLED 제외)
- ✅ 미수금 30일+ 정밀 계산 (customerLedger groupBy _min)
- ✅ 마진 LotConsumption 우선 + unitCostSnapshot fallback
- ✅ 비즈니스 지표 5개 (AOV/반품률/재구매율/임대 가동률 + 결제수단 분포 차트)
- ✅ 기간 토글 (`?period=today|this-week|this-month|last-month|custom` + `?from=&to=`)
- ✅ 18 KPI 클릭 점프 (`ClickableStat` Link 래핑)
- ✅ 모바일 컴팩트 + 추가 KPI 토글 (`CollapsibleKpiSection`)
- ✅ 활성 고객 정의 명확화 (soldOrderWhere 동기)
- ✅ 마진율 6개월 추이 line + 카테고리별 매출 도넛
- ✅ 효율 지표 (재고 회전율 / DoI / 수리 공임 비중 / 재수리율)
- ✅ 도넛 차트 모바일 세로 배치
- ✅ 역할별 KPI (STAFF 는 재무 지표 숨김) · 새로고침 버튼 · `/help` 가이드 페이지
- ✅ 세금계산서 발행 대기 KPI · CSV 내보내기 · 요일×시간 매출 히트맵

**남은 항목** (전부 낮음 또는 보류 — 전체 목록은 [docs/DASHBOARD.md](docs/DASHBOARD.md)):
- 클라이언트 컴포넌트 전환 (`useQuery` + `/api/dashboard/summary`) — ROI 모호, 보류 (server component + router.refresh 로 실용 충분)
- 새 DB 모델 필요해서 보류 — 위젯 사용자 맞춤화 (사용자 설정 모델) · 매출 목표 게이지 (목표 모델) · 외부 채널 health (last poll 추적)

> 참고 — 2026-04 견적서·거래명세표 도입 당시 MVP에서 제외했던 ① 견적서 → Order/Incoming/PurchaseOrder 전환, ② 견적서 → 거래명세표 전환 UI, ③ 회사 정보 DB 이전(`CompanyInfo` 싱글턴) 은 모두 구현 완료. `/api/quotations/[id]/convert` 와 `/quotations` 페이지 전환 다이얼로그, `/api/company-info` 가 그 결과.

> 참고 — 2026-05-07 주문 시스템 3축 분리(출고·결제·클레임), 반품 흐름 세분화(RETURN_REQUESTED/RETURN_ACCEPTED), 교환 자동화(EXCHANGE_SAME/DIFFERENT + 새 주문 자동 생성 + 양방향 link), 마진 리포트 정합성 (교환 발송 자동 제외), OrderItem 편집 UI(PENDING 한정), customerPayment FIFO 자동 매칭(외상→입금 시 paymentStatus 자동 PAID), 외부 채널 자동화 Phase 1 (`ChannelAdapter`/`MockChannelAdapter`/`ChannelProductMapping`/`PendingChannelOrder` + `/channels/imports` 페이지), Phase 3·4·6+ Phase 2-비의존 부분(SKU 자동 매핑 추천 + Outbound hook + Cron 라우트 `/api/cron/channel-poll` + 운영 대시보드 위젯) 도입 완료. 자세한 설계와 시각 위계는 [docs/ORDERS_SYSTEM.md](docs/ORDERS_SYSTEM.md).

> 참고 — 2026-05-09 통합 판매내역(`/sales/history`) jm 디자인 시스템 리뉴얼 완료. 3축(출고·결제·클레임) 컬럼 분리, 채널별 매출 분포 한 줄, 환불·매출취소 행 시각 분리(strike + bg muted), `JmDateRangePicker` + `JmComboboxModal`(고객 풀스크린 검색), KPI 5개(총거래액·순매출·미수·환불취소·진행중클레임), `-EX` 교환 새 주문 기본 제외 토글. API 응답에 `paymentStatus`/`claimType`/`claimReason`/`fulfillmentType`/`channelOrderNo`/`isExchangeReplacement` 추가, 신규 필터(`statusGroup`/`paymentStatus`/`channelFilter`/`includeExchangeReplacement`). `OrderDetailSheet` 의 9개 mutation 이 `queryKeys.sales.all` 도 함께 invalidate (orders 액션 → sales 자동 갱신). 부수: 동일 sheet 의 pre-existing setState-in-effect lint 에러도 렌더 중 비교 패턴으로 정리.

> 참고 — 2026-05-10 채널 SKU 옵션값 매핑(SWAP) UI + import.ts 통합(`ChannelProductMapping.productOptionValueId` + `entryProductId`/`optionSnapshot` 자동 부여), POS 견적서 → 카트 로드(빈 카트 CTA + 액션 그리드 1×5→2×3 + `replaceItems` context helper + `/api/quotations` `customerId` 필터), POS 수리관리 [결제로 이동] 자동 카트 라인 추가(`calcFinal` → repair 라인 inject + 중복 가드), POS 카트 시트 액션 그리드 [할인][배송비][시리얼출력]/[장바구니저장][견적서][불러오기], OPTION_PARENT prepare 가드 추가(canonical 가드 확장), 주문 변형/옵션 출고 SKU 선택 UI([_variant-resolve-dialog.tsx](src/app/(dashboard)/orders/_variant-resolve-dialog.tsx)) — 상세 시트 라인별 [출고 SKU 선택] 버튼 + 워크보드 행 "변형 미확정"/"옵션 미확정" 노란 배지 + [출고대기] 가드 에러 시 다이얼로그 자동 오픈 → 일괄 해결 → prepare 자동 재시도. ProductOption MappingPicker → ProductCombobox 교체. 검증 시드: [scripts/seed-variant-test-order.ts](scripts/seed-variant-test-order.ts).

> 참고 — 2026-05-10 후속 — 주문/POS 도메인 batch 마무리: (1) 알림 EXCHANGE_DIFFERENT_PAYMENT 자동 SMS 안내 (전체·부분 교환 양쪽), (2) 송장 사전 등록 카드 ([_detail-sheet.tsx](src/app/(dashboard)/orders/_detail-sheet.tsx) `PreShipmentTrackingCard`) — PREPARING 단계에서 송장 미리 입력 → ship 다이얼로그 자동 prefill, (3) POS 손님 카드 X 그냥닫기 5초 undo 토스트 (`restoreSession` context helper), (4) `/pos/parked` 검색·정렬(이름·전화·라벨 / 최근·오래된·라인많은·이름순), (5) 저장된 상담 → 견적서 일괄 변환 (`/api/pos/sessions/[sid]/issue-quotation` + 행 [견적서] 버튼 + 새 탭 PDF), (6) PARTIAL_REFUND 매출 계산 보강 — sales/history `partialRefundAmount` 필드 + summary `refundedAmount` 가산, (7) 자동 만료/노쇼 cron `/api/cron/noshow-policy` (RESERVED 임대 → CANCELLED + 진단 대기 N일 ADMIN 이메일), (8) 반품 처리 전용 뷰 `/orders/claims` (4 그룹 KPI + 액션 inline + view=claims API filter), (9) 운임 자동 청구 정책 — claimReason → liability(shop/customer/shared) → -EX 새 주문 `shippingPaymentType` 자동 STORE_BURDEN/COD/PREPAID + memo 안내, (10) 채널 운영 정책 다이얼로그 ([channels/page.tsx](src/app/(dashboard)/channels/page.tsx) `ChannelConfigDialog`) — 자동 송장 push / 자동 재고 sync 토글 + polling 분 / 출고 offset / 보류 큐 임계값 숫자 입력 → `/api/channels/[id]/config` PATCH 저장, (11) 주문 페이지 모든 하드코딩 폰트 사이즈를 `text-jm-*` 토큰으로 통일 (page/_detail-sheet/_parts/_create-sheet/_variant-resolve-dialog/help/stats), (12) [docs/POS_V1_V2_COMPARISON.md](docs/archive/POS_V1_V2_COMPARISON.md) 를 docs/archive/ 로 이동.

> 참고 — 2026-05-10 추가 — 외부 채널·알림 인프라 보강: (1) `ChannelOutboundJob` 모델 + `ChannelOutboundJobStatus`/`ChannelOutboundJobKind` enum 도입 (PUSH_TRACKING/PUSH_STOCK/ACCEPT_RETURN/REJECT_RETURN). 실패한 outbound 가 audit log 뿐 아니라 retry 큐로 자동 enqueue (중복 PENDING 은 lastError·payload 만 갱신). (2) [/api/cron/outbound-retry](src/app/api/cron/outbound-retry/route.ts) 라우트 — PENDING + nextAttemptAt ≤ now 항목을 batch drain, exponential backoff(2^attempts 분), maxAttempts(5) 도달 시 FAILED 종결. 채널 비활성·어댑터 미등록 시 즉시 FAILED. (3) [Solapi 어댑터](src/lib/notifications/solapi.ts) 스캐폴드 — HMAC-SHA256 인증 + SMS 전송 작동. 카카오 알림톡은 PFID 설정 시 자동 분기, 템플릿 매핑은 추후. (4) `dispatch.ts` 환경변수 자동 분기 — `SOLAPI_API_KEY/SECRET/SENDER_PHONE` 설정되면 Solapi, 아니면 Mock 폴백. ENV 미설정 환경은 그대로 dev mock 동작.

> 참고 — 2026-05-12 — 환불 도메인 정식화 + 주문 UX batch + POS 반품·교환 진입: (1) **CustomerRefund 도메인** — Prisma `CustomerRefund` 모델 + `CustomerRefundMethod` enum (CARD_CANCEL/CASH/BANK_TRANSFER/POINTS/OTHER). 지금까지 [반품완료] 누르면 paymentStatus 만 REFUNDED 로 바뀌고 실제 환불 금액·방법·일자가 기록 안 됐음 — 매장이 PG 콘솔/은행에서 손으로 환불 처리해도 시스템엔 "끝났음" 만 남음. 이제 refund API 가 `refundInput` payload 받아 CustomerRefund row 자동 생성 (PAID/REFUND_PENDING 만; UNPAID 는 기존 ledger ADJUSTMENT 그대로). exchange 는 paymentStatus 유지 → 차액은 새 -EX 주문에서 처리되므로 제외. (2) **RefundDialog 확장** — 환불 금액·방법·일자·메모 입력 카드 4종. 진입 + 모드 토글 시 자동 채움 (전체=totalAmount-누적환불, 부분=수량×단가 합); 사용자 자유 수정 가능. UNPAID 면 "외상 매출 취소" 안내. COMPLETED 즉시반품(return 단축경로)도 같은 다이얼로그 사용. (3) **customer/[id]/ledger 환불 노출** — API 응답에 `refunds` 배열, UI 가 `LedgerEntry` 모양으로 변환해 dateGroups 에 인터리브. 가상 타입 `REFUND_LOG` (잔액 무관 표시 + bg-destructive/5). (4) **_detail-sheet 분리 시작** — `_refund-dialog.tsx` 별도 파일 (430줄 self-contained). 부모는 open + initialPartialReturns prefill 만 관리. 3052 → 2926 줄. 다음 dialog (Ship/Claim/Exchange) 분리 시 같은 패턴. (5) **UI/UX 4종** — KPI 카드 로딩 `—` 대시 → `JmSkeleton`, 부분 발송 잔여 초과 검증 (빨강 border + submit 차단), 도움말 "2-2. 워크보드 필터·검색 사용법" 섹션, 모바일 테이블 첫 열 sticky (sm:static). (6) **POS 반품·교환 단축 진입** — `/api/customers/[id]/refundable-orders` (COMPLETED + RETURN_INSPECTED, -EX 새 주문 제외) + `_return-exchange-sheet.tsx` (주문 카드 리스트 → [반품]/[교환] 분기). [반품] 은 워크보드 RefundDialog 재사용. [교환] 은 `ExchangeMiniDialog` (SAME/DIFFERENT 토글) → exchange API → 새 -EX 주문 자동 생성. CustomerActionSheet 에 `onReturnExchange` prop 추가, 등록 고객만 노출. (7) **StatusFlowGuide 제거** — 워크보드·claims 뷰에서 제거 (도움말에 더 상세히 있고 클릭 불가). 도움말 페이지에선 유지. (8) **클레임 뷰 진입점** — `/orders/claims` 가 dead route 였음 (도움말 텍스트로만 언급). 워크보드 우측 액션 영역에 [반품 처리] 버튼 추가.

> 참고 — 2026-05-17 — 대시보드 batch 6 (세금계산서·CSV·히트맵): (1) 세금계산서 발행 대기 KPI — `Order.taxInvoiceRequested && taxInvoicedAt=null && status≠CANCELLED` 카운트 (별도 TaxInvoice 모델 불필요, `/api/tax-invoices/pending` 과 동일 정의). 워크플로 대기 row 4→5개 (`CollapsibleKpiSection` 에 `cols` prop 추가). (2) CSV 내보내기 — `_csv-export.tsx` `CsvButton` (BOM 포함 — Excel 한글), `SectionHeader` 에 `csv` prop. 베스트셀러·VIP·데드스톡 적용. (3) 요일(7)×시간(24) 매출 히트맵 `SalesHeatmap` — 선택 기간 SOLD 주문 시각 집계, opacity 농도 + title 툴팁, ADMIN 전용. (보류: 위젯 맞춤화·매출 목표 게이지는 새 DB 모델 필요, 클라이언트 전환은 ROI 모호.)

> 참고 — 2026-05-16 — 대시보드 batch 5 (권한·새로고침·도움말): (1) 역할별 KPI — `user.role === "ADMIN"` 분기. STAFF 는 사장 KPI·비즈니스/효율 지표·오늘 현금흐름·매출 차트·VIP/거래처 미지급/고객 미수금 테이블 숨김 (재무 민감 정보). 운영 알람·워크플로 대기·최근 주문·재고·감사로그만 노출. (2) `ClickableStat` 을 클라이언트 컴포넌트(`_clickable-stat.tsx`)로 분리 — 서버 컴포넌트 페이지에서 interactive `JmStat`(이벤트 핸들러 보유) 을 렌더하면 "Event handlers cannot be passed to Client Component props" 런타임 에러. `JmStat` 은 `"use client"` 없어 서버 컴포넌트라 interactive 모드를 서버에서 못 씀. (3) 새로고침 — `_refresh-button.tsx` (`router.refresh()` + `useTransition`, "HH:MM 기준" 표시). (4) `/help` 대시보드 가이드 페이지 (`(home)/help/page.tsx`) — KPI 의미·계산식·기간 토글·권한 설명, 헤더 "가이드" 링크 진입.

> 참고 — 2026-05-16 — 대시보드 batch 4 (효율 지표): 효율 지표 KPI row 추가 (5번째 row) — 재고 회전율 (기간 매출원가/재고 자산), 재고 소진일수 DoI (재고 자산÷일평균 매출원가), 수리 공임 비중 (`RepairLabor.totalPrice`/(labor+part)), 재수리율 (`parentRepairTicketId` 있는 티켓/기간 접수). 회전율·DoI 는 기존 `monthlyCost`·`inventoryAssetValue` 재활용 (추가 쿼리 0). 도넛 차트 (`ChannelDonut`) 모바일 세로 배치 (sm 미만 도넛↑범례↓).

> 참고 — 2026-05-15 추가³ — 대시보드 batch 3 (정의·UX·시각화 확장): (1) 활성 고객 정의 → `soldOrderWhere` 와 동기 (정상 매출 거래만, 취소·반품·매출취소 제외). (2) 사용자 지정 기간 `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` — `JmDateRangePicker` 2개월 동시 + `parseYmd`/`formatYmd` 헬퍼 + `periodRange()` custom 분기 (잘못된 범위는 this-month 폴백). (3) 모바일 추가 KPI 토글 `CollapsibleKpiSection` — "더 보기" 버튼 (ChevronDown/Up) 모바일에만 노출, 클릭 시 그리드 펼침. (4) 최근 6개월 마진율 line chart (`MarginTrendLine` recharts) — 단일 OrderItem.findMany (6개월치) 메모리 월별 그룹핑 + itemCost 헬퍼로 LotConsumption 우선. (5) 카테고리별 매출 도넛 — Product.categoryId groupBy. 차트 섹션 단일 → 2 row (추세 2개 / 분포 3개).

> 참고 — 2026-05-15 추가² — 대시보드 정확성 + 인터랙티브 batch: (1) 매출 정의 `/sales/history` netAmount 와 동기화 — `soldOrderWhere` 통일 (`paymentStatus NOT IN [REFUNDED, SALES_CANCELLED]`) + `OrderItem.refundedAmount` 합으로 PARTIAL_REFUND 차감. (2) 마진 계산 LotConsumption 우선 + unitCostSnapshot fallback (`itemCost()` 헬퍼). (3) 미수금 30일+ 정밀 (`customerLedger.groupBy by:customerId _min:createdAt where:type=SALE`). (4) 비즈니스 지표 5개 — 객단가/반품률/재구매율(90일)/임대 가동률 + 결제수단 분포 막대 차트 (`PaymentMixBars`). (5) 기간 토글 — `?period=today|this-week|this-month|last-month`, `_period-toggle.tsx` (JmSegmentedControl) + `periodRange()` 헬퍼 — 매출·이익·AOV·반품률·베스트셀러·VIP·결제수단·신규고객 + delta 비교 기간 동시 전환. (6) 18 KPI 전부 `ClickableStat` 헬퍼로 해당 워크보드 점프 (Link 외부 래핑 + `interactive` prop). (7) 모바일 컴팩트 모드 — 워크플로 대기 + 비즈니스 지표 row 모바일 hidden md:grid.

> 참고 — 2026-05-15 메인 대시보드 (`/`) shadcn → jm 마이그레이션 + 도메인 확장 완료. [dashboard-shell.tsx](src/components/layout/dashboard-shell.tsx) JmScope cascade 본문까지 닿게 정리 (이전엔 로딩바·모바일 헤더만 감쌌음). KPI 6 → 16 (사장 4 + 운영 알람 8 + 워크플로 대기 4), 사장 KPI 는 매출/매출총이익(delta vs 지난달)/영업이익/재고 자산 가치. 오늘 현금흐름 카드 (결제·지급·지출·순). recharts 차트 2개 (7일 매출 AreaChart + 채널 도넛). 빠른 액션 + 글로벌 검색 ⌘K 다이얼로그 6 카테고리. 신규 테이블: 베스트셀러·데드스톡 90d+·VIP 고객·최근 활동(AuditLog). 약 45개 쿼리 Promise.all 병렬. 진입점·우선순위·계산식 전체 카탈로그는 [docs/DASHBOARD.md](docs/DASHBOARD.md).

> 참고 — 2026-05-10 추가² — 모든 backlog 마무리: (1) [Coupang](src/lib/channels/coupang.ts) / [Naver](src/lib/channels/naver.ts) 어댑터 스캐폴드 — HMAC/OAuth 인증 framework 완성, 메서드별 endpoint TODO. registry 가 환경변수 (`COUPANG_VENDOR_ID/ACCESS_KEY/SECRET_KEY` / `NAVER_CLIENT_ID/SECRET`) 설정 시 자동 등록. (2) [Inbound webhook 라우트](src/app/api/webhooks/channels/[code]/route.ts) `/api/webhooks/channels/[code]` — 채널 lookup → adapter.verifyWebhookSignature → parseWebhookEvent → kind 별 dispatch framework. 어댑터 메서드 채워지면 자동 활성화. (3) Solapi 카카오 알림톡 템플릿 매핑 — `KAKAO_TEMPLATE_BY_KIND` 가 환경변수 (`SOLAPI_KAKAO_TPL_ORDER_DELIVERED/RETURN_ACCEPTED/...`) 에서 templateId 자동 lookup. payload.meta.kakaoVars 로 변수 전달. 미설정 kind 는 SMS 폴백. (4) `RETURN_PICKING` enum 추가 — 반품 회수 단계 세분화 (RETURN_ACCEPTED → RETURN_PICKING → RETURN_COLLECTED). `start_picking` 액션 신규, 기존 `collect_return` 은 양쪽 from 허용 (직접 회수 + 라벨 발급 후 도착). 워크보드/상세시트/claims 페이지 라벨·필터 모두 갱신. (5) **메인+옵션+추가구매 동시 매핑** — `ChannelProductMappingComponent` 에 `lineRole` (MAIN/OPTION/ADDON) + `productOptionValueId` 추가. 한 채널 SKU 가 메인·옵션·추가구매 라인 동시 매핑 가능. import.ts 가 lineRole 기반으로 OrderItem.lineRole(MAIN/OPTION_REF/ADDON) + parentItemId 트리 자동 구성 (Order 생성 후 두 패스 — items 생성 → parent link). 단순 1:N 세트 풀이는 기존 동작 유지 (모두 MAIN). (6) `/channels/imports` AddMappingDialog 다중 모드에 **메인/옵션/추가** 라인 역할 셀렉터 추가 — 사용자가 한 채널 SKU 에 메인+옵션+추가구매 라인 동시 등록 가능 (UI 까지 end-to-end 완성).

