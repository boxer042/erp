@AGENTS.md

# ERP 프로젝트 가이드

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
│   ├── (auth)/          # 로그인/회원가입 (비인증 레이아웃)
│   ├── (dashboard)/     # 메인 앱 (인증 레이아웃)
│   │   ├── suppliers/       # 거래처 관리
│   │   ├── supplier-products/ # 거래처 상품
│   │   ├── products/        # 판매상품, 세트, 매핑
│   │   ├── inventory/       # 재고, 입고, 초기등록, 실사보정
│   │   ├── orders/          # 주문
│   │   ├── channels/        # 판매채널
│   │   ├── pricing/         # 가격/마진
│   │   └── settings/        # 설정
│   ├── api/             # REST API 라우트
│   └── auth/callback/   # Supabase OAuth 콜백
├── components/
│   ├── ui/              # 기본 UI (shadcn/base-ui 기반)
│   ├── layout/          # app-sidebar, breadcrumb, dashboard-shell
│   ├── data-table/      # data-table-toolbar
│   ├── providers.tsx              # QueryClientProvider 래퍼 (RootLayout 주입)
│   ├── quick-register-sheets.tsx  # 거래처/공급상품/판매상품 빠른 등록 (공통)
│   └── mapping-dialog.tsx         # 상품 매핑 다이얼로그
├── lib/
│   ├── prisma.ts        # PrismaClient 싱글턴
│   ├── auth.ts          # getCurrentUser, requireAuth
│   ├── constants.ts     # TAX_RATE, PAYMENT_METHODS, UNITS 등
│   ├── utils.ts         # cn() (clsx + tailwind-merge)
│   ├── api-client.ts    # apiGet/apiMutate + ApiError (모든 클라이언트 fetch는 여기 통과)
│   ├── query-keys.ts    # React Query 도메인별 key factory
│   ├── supabase/        # client.ts, server.ts, middleware.ts
│   └── validators/      # Zod 스키마 (product, supplier, order 등)
└── middleware.ts        # Supabase 세션 관리
```

## ⚠️ 필수 코드 패턴 (신규/수정 시 반드시 준수)

> 아래 3가지 패턴은 2026-04 코드 최적화에서 정착시킨 것. 새 페이지/컴포넌트/API 라우트를 만들거나 기존 파일을 수정할 때 **항상 이 패턴을 따를 것**. 위반 시 곧장 기술 부채가 누적됨.

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

---

## 데이터베이스 스키마

### 인증
- **User** — Supabase 연동, ADMIN/STAFF 역할

### 거래처
- **Supplier** — 거래처 (사업자번호, 대표자, 전화, FAX, 이메일, 주소, 결제방식 CREDIT/PREPAID)
- **SupplierContact** — 거래처 담당자 (이름, 휴대폰, 이메일, 직책) / Supplier 1:N
- **SupplierProduct** — 거래처 공급상품 (품명, 품번, 단위, 단가, 통화)
- **SupplierProductPriceHistory** — 공급상품 단가 변동 이력
- **SupplierLedger** — 거래처 원장 (PURCHASE/PAYMENT/ADJUSTMENT/REFUND)
- **SupplierPayment** — 거래처 결제 기록

### 상품
- **Product** — 판매상품 (SKU, 바코드, 단위, 세금유형, 판매가, 세트여부)
- **ProductMapping** — 공급상품 → 판매상품 매핑 (환산비율 conversionRate)
- **SetComponent** — 세트상품 구성 (상위상품 → 하위상품, 수량)
- **ChannelPricing** — 채널별 판매가

### 재고 (로트 기반 FIFO)
- **Inventory** — 상품별 현재 재고 (수량, 안전재고) / Product 1:1. `avgCost`는 deprecated 캐시값이며 실제 원가는 로트에서 계산
- **InventoryMovement** — 재고 변동 이력 (INCOMING, OUTGOING, ADJUSTMENT_PLUS/MINUS, SET_CONSUME, SET_PRODUCE, RETURN, INITIAL, STOCKTAKE_PLUS/MINUS). 실사보정 시 `reason` (StocktakeReason enum) 기록
- **InventoryLot** — 입고/기초/조정으로 생성되는 재고 로트. 필드: `productId`(nullable=오르판), `supplierProductId`, `receivedQty/remainingQty`, `unitCost`, `receivedAt`, `source`(INCOMING/INITIAL/ADJUSTMENT)
- **LotConsumption** — 주문 확정 시 FIFO로 소진한 로트 기록 (orderItemId ↔ lotId). 주문 취소/반품 시 복원에 사용

### 입고
- **Incoming** — 입고 전표 (입고번호 IN[YYMMDD]-[4자리], PENDING→CONFIRMED→CANCELLED)
- **IncomingItem** — 입고 품목 (공급상품, 수량, originalPrice 할인전단가, discountAmount 개당할인액, unitPrice 실제단가(세전), totalPrice 공급가액합계(세전), unitCostSnapshot 원가스냅샷)

### 주문
- **Order** — 주문 (주문번호 ORD[YYMMDD]-[4자리], 채널, 고객정보, 수수료)
- **OrderItem** — 주문 품목

### 판매채널
- **SalesChannel** — 채널 (쿠팡, 네이버, 자사몰, 오프라인 / 수수료율)
- **ChannelFee** — 채널 추가 수수료

### 비용
- **IncomingCost** — 입고 비용 (공급상품 기준, PERCENTAGE/FIXED)
- **SellingCost** — 판매 비용 (판매상품 기준, PERCENTAGE/FIXED)

### 주요 관계
- SupplierProduct → ProductMapping → Product (환산비율로 단위 변환)
- Incoming 확정 → Inventory 증가 + InventoryMovement(INCOMING) + **InventoryLot 생성** (매핑 있으면 productId=mapping.productId, 없으면 오르판 productId=null) + SupplierLedger(CREDIT일 때)
- Order 확정 → Inventory 감소 + InventoryMovement(OUTGOING/SET_CONSUME) + **FIFO로 로트 소진 + LotConsumption 생성**. 로트 잔량 부족 시 에러로 확정 차단
- Order 취소/반품 → **LotConsumption 역순 복원 + 삭제** + Inventory 복원
- SupplierReturn 확정 → **FIFO로 공급상품 로트 잔량 차감** + Inventory 감소 + SupplierLedger(CREDIT이면 REFUND)
- Stocktake(실사보정) → diff>0 이면 새 ADJUSTMENT 로트 생성 (거래처 선택 필수), diff<0 이면 FIFO로 로트 차감 + Inventory 절대값 설정
- ProductMapping 생성 → 해당 공급상품의 오르판 로트(productId=null)를 소급 편입 + Inventory 환산 증가
- 기초등록(`/inventory/initial`) → SupplierProduct 등록 + INITIAL 로트 생성 (1회성 가드). SupplierLedger 영향 없음
- 기초 미지급금(`/suppliers/initial-balance`) → SupplierLedger(ADJUSTMENT, referenceType=INITIAL_BALANCE) 기록 (1회성 가드). 재고 영향 없음
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

### 테마 색상 (CSS 변수 기반 — 라이트/다크 자동 대응)
- 배경: `bg-background` (메인), `bg-card` (카드), `bg-muted` (테이블헤더·서브배경), `bg-secondary` (강조 배경)
- 사이드바: `bg-sidebar`
- 테두리: `border-border`
- 텍스트: `text-foreground` (기본), `text-muted-foreground` (뮤트)
- 호버: `hover:bg-muted/50`, `hover:bg-muted`
- 브랜드: `text-primary`, `bg-primary`, `bg-brand-muted`
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

모든 대시보드 페이지의 공통 구조:
```tsx
<div className="flex h-full flex-col">
  <DataTableToolbar ... />              {/* 상단 고정 */}
  <div className="flex-1 overflow-auto"> {/* 스크롤 영역 */}
    <Table>...</Table>
  </div>
</div>
```
- 루트: `flex h-full flex-col` (브라우저 높이 사용)
- 콘텐츠: `flex-1 overflow-auto` (남은 공간 채움 + 스크롤)
- Table 부모에 padding 없음

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
- 테이블: `<TableCell colSpan={N} className="text-center py-8">로딩 중...</TableCell>`
- 버튼: `{submitting ? <Loader2 className="animate-spin" /> : <Icon />}`
- 새로고침: `<RefreshCw className={loading ? "animate-spin" : ""} />`

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

**재고 부족 처리**: 주문 확정 시 로트 잔량이 부족하면 에러로 확정 차단. 실사보정으로 재고를 맞춘 뒤 재확정하는 흐름.

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

## 후속작업해야할것

견적서·거래명세표 기능(2026-04) 도입 당시 MVP로 제외한 항목. 필요해지면 아래 순서로 처리 가능.

### 1. 견적서 → Order/Incoming 전환
- **현재**: `POST /api/quotations/[id]/convert`는 `target=statement`만 허용. Order/Incoming 전환 미구현.
- **필요한 이유**: "수락된 견적서를 자동으로 주문/입고로 승격"하는 플로우가 필요할 때.
- **구현 포인트**:
  - `target=order`: SALES 견적서 → Order 생성. `channelId` 필수라 전환 모달에서 채널 선택 UI 추가 필요. OrderItem은 `productId` 없는 자유입력 행은 생성 불가 → 사전 매핑 강제.
  - `target=incoming`: PURCHASE 견적서 → Incoming 생성. `supplierProductId` 없는 행은 생성 불가.
  - 전환 후 원본 견적서 `status=CONVERTED`로 락(읽기 전용)할지 정책 결정.

### 2. Order 폼의 Customer 엔티티 연동
- **현재**: `Order.customerId` 컬럼은 DB에 존재. 목록 페이지만 있고 등록/수정 폼이 미완성이라 보류.
- **필요한 이유**: 채널 주문 외 B2B 고객 주문에서 재방문 추적이 필요할 때.
- **구현 포인트**: Order 등록 Sheet에 `CustomerCombobox` 추가. 선택 시 `customerName/Phone/shippingAddress` 스냅샷 자동 채움.

### 3. 견적서 → 거래명세표 전환 버튼 UI
- **현재**: convert API(`target=statement`)는 구현됨. 견적서 목록/상세에 버튼이 없어 호출 수단만 없음.
- **구현 포인트**: `/quotations` 목록 row 액션 또는 QuotationSheet 편집 모드에 "거래명세표로 전환" 버튼 추가. SALES 타입일 때만 노출.

### 4. 회사 정보(공급자) 환경변수 설정
- **현재**: 인쇄 페이지(`/quotations/[id]/print`, `/statements/[id]/print`)는 공급자 영역을 `.env`에서 읽음. 미설정이면 "우리 회사"로 출력.
- **설정 방법**: `.env.local`에 추가:
  ```
  COMPANY_NAME=상호명
  COMPANY_BIZ_NO=000-00-00000
  COMPANY_CEO=대표자
  COMPANY_PHONE=02-0000-0000
  COMPANY_ADDRESS=주소
  ```
- **향후 개선**: 환경변수 대신 `settings` 테이블이나 `Company` 모델로 이전해 관리자 UI에서 수정 가능하게.

### 5. 통합 판매내역 페이지 (판매 + 수리 + 임대)
- **현재**: 매출이 `Order` / `RepairTicket.finalAmount`(PICKED_UP) / `Rental.finalAmount`(RETURNED) 세 소스에 흩어져 있음. `/orders`는 `Order`만 노출, `/pos/repair`·`/pos/rental`은 각 소스 탭별로만 확인 가능. 하루 단위 요약은 `/pos/reports/daily`에 있으나 목록 뷰는 없음.
- **필요한 이유**: "한 달 매출 전체를 시간순으로 리뷰"하거나 특정 고객의 전체 매출 이력을 한눈에 보고 싶을 때.
- **구현 포인트**:
  - ERP 대시보드 쪽 `/sales/history` — 기간·결제수단·타입(판매/수리/임대)·고객·채널 필터, CSV 내보내기
  - 세 소스를 UNION해서 `{ type, refNo, date, customerName, paymentMethod, amount, status }` 형태로 정규화한 API 신설 (예: `GET /api/sales/history`)
  - 필요 시 POS에서도 `/pos/history` 간략 뷰 추가 (목록만)
  - 정렬 키: `Order.orderDate` / `RepairTicket.pickedUpAt` / `Rental.actualReturnedAt` — null이면 `createdAt` 폴백
- **연관**: 고객 상세 페이지(`/pos/customers/[id]`)의 구매/수리/임대 탭이 이미 이 데이터를 소스별로 가져오고 있으므로 API 일부 재사용 가능.