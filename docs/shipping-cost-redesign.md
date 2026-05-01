# 배송비 모델 재설계 (2026-04)

## Context — 왜 바꿨나

기존 ERP는 배송비 입력 채널이 두 개로 갈라져 있었음.

1. `IncomingCost` (공급상품에 영구 등록되는 부대비용) — "택배비 5,000" 같은 항목이 등록되어 있었음
2. `Incoming.shippingCost` (입고 전표 단위 배송비) — 전표마다 입력, 품목에 공급가액 비례 분배

**문제 1 — 중복 합산**: 두 채널이 모두 `unitCostSnapshot`에 합산되어 사용자가 양쪽에 같은 의미의 배송비를 입력하면 원가가 두 번 잡혔음. 시스템상 검증도 없었음.

**문제 2 — 품목별 분리 입력 불가**: 한 전표에 A/B/C 품목이 묶여 있을 때 A만 별도 운임(예: 6,000원)을 적용하고 싶어도 전표 단위 입력만 가능 → 후기입 시점에도 A에만 다른 값을 못 넣음.

**문제 3 — 평균 배송비 표시값 왜곡**: 거래처상품 상세의 "평균 배송비"가 산술평균이라 0원 입고가 끼면 의미 없는 값이 표시됐음.

## 설계 결정 (확정)

- 배송비를 `IncomingCost`에서 **분리**. `IncomingCost`는 포장비/검수비 등 비배송 부대비용 전용
- `IncomingItem`에 **`itemShippingCost`(합계, VAT포함)** + **`itemShippingIsTaxable`** 신설. 품목별 운임을 별도로 입력 가능
- 우선순위:
  1. `IncomingItem.itemShippingCost` not null → 그 품목은 자기 운임. 전표 분배에서 빠짐
  2. 그 외 품목은 `Incoming.shippingCost`를 자기들끼리 금액 비례 분배 (override 품목 제외, "B-1 재분배")
  3. 둘 다 null/0이면 그 품목 배송비 0 (폴백 없음)
- `SupplierProduct.defaultShippingCost`는 **도입하지 않음**. 누락 보호가 필요하면 사용자가 전표를 찾아 품목별로 직접 채움
- null과 0은 동일 취급 ("그 입고/품목의 실제 배송비 0")
- 거래처 차감(`shippingDeducted=true`)은 **전표 단위에만 적용**. 품목 override는 항상 비차감
- 누락 보호 = **수정 경로 다양화**. 사용자가 누락을 발견한 화면에서 바로 수정:
  - 경로 1: 입고 전표 → 후기입 다이얼로그 (품목별 토글)
  - 경로 2: 거래처상품/내상품 상세의 이력 박스 → 행 클릭 → 인라인 popover

## 핵심 흐름

### 입고 확정 시 로트 원가 결정

```
각 IncomingItem 별로:
  shippingNetPerUnit =
    if itemShippingCost not null:
      (itemShippingCost / qty) / (itemShippingIsTaxable ? 1.1 : 1)
    elif shippingDeducted:
      0
    else:
      ((totalPrice / Σ분배품목totalPrice) × Incoming.shippingCost / qty) / (shippingIsTaxable ? 1.1 : 1)

  baseSnapshot = unitPrice + shippingNetPerUnit + IncomingCost(부대비용)

같은 supplierProductId 그룹은 가중평균 → unitCostSnapshot
unitCostSnapshot → InventoryLot.unitCost 로 박힘 (매핑된 경우 conversionRate 적용)
```

### 판매 시 (변경 없음)

- FIFO로 `InventoryLot.remainingQty` 차감 + `LotConsumption` 생성
- `OrderItem.unitCostSnapshot` = 소진된 로트들의 가중평균 (기존 메커니즘 그대로)

### 수정 경로

- **입고 전표 후기입** (`update-shipping`): 전표 운임 + 품목별 override 일괄 수정 → 그 입고의 모든 unitCostSnapshot + 관련 InventoryLot.unitCost 재계산
- **인라인 수정** (`PATCH /api/incoming-items/[id]/shipping`): 한 품목의 override만 수정. 같은 전표의 다른 품목 분배 분모도 바뀌므로 일괄 재계산
- 두 경로 모두 내부적으로 `recalcIncomingShippingSnapshots(tx, incomingId)` 헬퍼를 사용 (또는 동일 로직 inline)

### 과거 입고 보존

마이그레이션 시 **확정된 입고의 `unitCostSnapshot`은 건드리지 않음**. 과거 원가는 그 시점 값으로 보존. 신규 알고리즘은 신규 입고부터 적용.

## 데이터 모델 변경

[prisma/schema.prisma](../prisma/schema.prisma) — `IncomingItem`:

```prisma
model IncomingItem {
  ...
  itemShippingCost      Decimal?  @map("item_shipping_cost") @db.Decimal(12, 2)
  itemShippingIsTaxable Boolean   @default(true) @map("item_shipping_is_taxable")
  ...
}
```

`Incoming.shippingCost`, `IncomingCost` 모델은 그대로 유지. `SupplierProduct`에는 새 필드 없음.

## 파일 변경 목록

### 신규 백엔드 파일
- [src/lib/incoming-shipping.ts](../src/lib/incoming-shipping.ts) — 분배 계산 (`computeShippingNetPerUnit`) + 이력 표시 (`computeShippingPerUnitDisplay`)
- [src/lib/incoming-recalc.ts](../src/lib/incoming-recalc.ts) — `recalcIncomingShippingSnapshots(tx, incomingId)` 트랜잭션 헬퍼
- [src/app/api/incoming-items/[id]/shipping/route.ts](../src/app/api/incoming-items/[id]/shipping/route.ts) — 단일 IncomingItem 인라인 수정 PATCH
- [src/app/api/supplier-products/[id]/shipping-history/route.ts](../src/app/api/supplier-products/[id]/shipping-history/route.ts) — 효과값+출처 라벨 이력

### 수정 백엔드 파일
- [src/app/api/incoming/[id]/route.ts](../src/app/api/incoming/[id]/route.ts)
  - 입고 확정 path: `computeShippingNetPerUnit` 사용
  - `update-shipping` action: 페이로드에 `items` 배열 받음 → 품목별 override 일괄 갱신
  - PUT update path: `itemShippingCost`/`itemShippingIsTaxable` persist
- [src/app/api/incoming/route.ts](../src/app/api/incoming/route.ts) — POST 시 `itemShippingCost` persist
- [src/lib/validators/incoming.ts](../src/lib/validators/incoming.ts) — `incomingItemSchema`에 `itemShippingCost`, `itemShippingIsTaxable` 추가
- [src/app/api/supplier-products/[id]/costs/route.ts](../src/app/api/supplier-products/[id]/costs/route.ts) — 배송/택배/운임/shipping/delivery/freight 키워드 차단
- [src/lib/cost-utils.ts](../src/lib/cost-utils.ts) — `computeUnitCost`에서 `avgShippingCost`/`avgShippingIsTaxable` 인자 제거. 시뮬레이션은 unitPrice + IncomingCost 만으로 계산
- [src/app/api/products/route.ts](../src/app/api/products/route.ts) — `computeUnitCost` 호출 정리
- [src/app/api/supplier-products/[id]/avg-shipping/route.ts](../src/app/api/supplier-products/[id]/avg-shipping/route.ts) — 그대로 유지 (호환성). 이력은 신규 `/shipping-history` 엔드포인트 사용

### 신규 UI 파일
- [src/components/shipping-history-card.tsx](../src/components/shipping-history-card.tsx) — `ShippingHistoryCard` + 인라인 수정 popover (`InlineShippingEditor`). 거래처상품/내상품 상세 양쪽에서 재사용

### 수정 UI 파일
- [src/app/(dashboard)/inventory/incoming/_types.ts](../src/app/(dashboard)/inventory/incoming/_types.ts) — `IncomingItemForm`/`IncomingDetail`에 itemShipping 필드 추가
- [src/app/(dashboard)/inventory/incoming/_parts.tsx](../src/app/(dashboard)/inventory/incoming/_parts.tsx) — `ItemShippingPopover` 컴포넌트 신설 (트럭 아이콘 트리거)
- [src/app/(dashboard)/inventory/incoming/page.tsx](../src/app/(dashboard)/inventory/incoming/page.tsx)
  - 행마다 `ItemShippingPopover` 배치 (메모 셀 옆)
  - 빈 행/편집 행 모든 곳에 `itemShippingCost: ""`, `itemShippingIsTaxable: true` 기본값
  - 후기입 다이얼로그에 `<details>` 토글로 품목별 입력 펼침 (`shippingEditItemOverrides` state)
  - submit 페이로드에 `itemShippingCost`/`itemShippingIsTaxable` 포함
- [src/app/(dashboard)/supplier-products/[id]/page.tsx](../src/app/(dashboard)/supplier-products/[id]/page.tsx)
  - 부대비용 표의 "평균 배송비" 행 제거
  - "배송비는 입고 전표에서 입력하세요" 안내 문구 추가
  - `<ShippingHistoryCard supplierProductId={...} />` 신규 섹션
  - `computeUnitCost` 호출에서 avg* 인자 제거
- [src/app/(dashboard)/products/[id]/page.tsx](../src/app/(dashboard)/products/[id]/page.tsx)
  - 매핑된 공급상품마다 `<ShippingHistoryCard />` 섹션 렌더 (공급자 매핑 아래)
- [src/app/(dashboard)/products/new/page.tsx](../src/app/(dashboard)/products/new/page.tsx)
  - `computeSupplierProductAvgShipping` import 제거. 시뮬레이션 시 배송비 미반영

## 우선순위 표 (운영 디버깅용)

| 케이스 | 적용 배송비 (개당, VAT포함) | 출처 라벨 |
|---|---|---|
| `itemShippingCost > 0` | `itemShippingCost / qty` | `품목 직접 입력` |
| `itemShippingCost = 0` (override 0) | `0` | `0원(미입력)` |
| `itemShippingCost = null` + `shippingDeducted=true` | `0` | `거래처 차감` |
| `itemShippingCost = null` + 전표값 > 0 | 분배 분모는 override 제외 | `전표 분배` |
| `itemShippingCost = null` + 전표값 0/null | `0` | `0원(미입력)` |

## 알고리즘 의사코드

[src/lib/incoming-shipping.ts](../src/lib/incoming-shipping.ts) `computeShippingNetPerUnit`:

```
allocBase = Σ(item.totalPrice for item in items if item.itemShippingCost is null)
for each item:
  if item.itemShippingCost not null:
    perUnit = (item.itemShippingCost / item.quantity) / (item.itemShippingIsTaxable ? 1.1 : 1)
  elif header.shippingDeducted:
    perUnit = 0
  else:
    line = (item.totalPrice / allocBase) × header.shippingCost   if allocBase > 0 else 0
    perUnit = (line / item.quantity) / (header.shippingIsTaxable ? 1.1 : 1)
  result[item.id] = perUnit
```

## API 스펙

### `PATCH /api/incoming-items/{id}/shipping`

단일 IncomingItem 의 운임 override 만 변경. 같은 전표의 모든 품목 unitCostSnapshot + 관련 InventoryLot.unitCost 재계산됨.

```jsonc
// Request body
{
  "itemShippingCost": "6000",        // string | null. null/"" → 분배로 되돌림
  "itemShippingIsTaxable": true       // optional, default true
}

// Response 200
{
  "id": "<incomingItemId>",
  "itemShippingCost": "6000.00",
  "itemShippingIsTaxable": true,
  "unitCostSnapshot": "..."
}
```

CONFIRMED 상태가 아니면 400. PENDING 상태 입고는 작성 폼에서 수정.

### `PUT /api/incoming/{id}` action=`update-shipping` (확장)

기존 페이로드 + `items` 배열:

```jsonc
{
  "action": "update-shipping",
  "shippingCost": "4000",
  "shippingIsTaxable": true,
  "shippingDeducted": false,
  "items": [
    { "id": "<itemId>", "itemShippingCost": "6000", "itemShippingIsTaxable": true },
    { "id": "<itemId2>", "itemShippingCost": null }
  ]
}
```

`items` 미전달 시 기존 itemShipping 값 그대로 두고 전표 운임만 변경.

### `GET /api/supplier-products/{id}/shipping-history?limit=10`

```jsonc
[
  {
    "incomingItemId": "...",
    "incomingId": "...",
    "incomingNo": "IN260101-0001",
    "incomingDate": "2026-04-25T...",
    "quantity": "10",
    "perUnitShipping": 600,           // VAT 포함 개당
    "isTaxable": true,
    "source": "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO",
    "itemShippingCost": "6000.00",   // null = 분배 적용 중
    "itemShippingIsTaxable": true
  },
  ...
]
```

## 마이그레이션 / 운영 주의

1. `prisma db push` 로 컬럼 추가 (nullable + default true 라 안전)
2. 과거 확정 입고의 `unitCostSnapshot` 은 그대로 보존 — 마이그레이션이 재계산하지 않음
3. 기존 `IncomingCost` 중 배송비 성격(이름 "택배비"/"배송비"/"운임" 등) 행은 운영자가 **수동으로 soft delete** (`isActive=false`) 권장
   - 거래처상품 상세의 부대비용 표에서 휴지통 클릭 (이미 등록된 행은 표시되지만 신규 등록은 키워드 차단됨)
   - 지운다고 과거 unitCostSnapshot 변동 없음 (스냅샷이 박혀 있어 안전)
   - 지우면 미래 입고에 그 IncomingCost 가 더 이상 합산되지 않아 중복 합산 방지
4. 신규 등록 차단 키워드: `배송비`, `택배비`, `운임`, `shipping`, `delivery`, `freight`. [src/app/api/supplier-products/[id]/costs/route.ts](../src/app/api/supplier-products/[id]/costs/route.ts) 에서 `name` 매칭 검사

## 손대지 않은 것 (회귀 위험 영역)

- `InventoryLot.unitCost`, FIFO 소진, `OrderItem.unitCostSnapshot`, `LotConsumption` 메커니즘
- 이동평균/`Inventory.avgCost` (deprecated 캐시)
- 거래처 차감(`shippingDeducted`) 회계 처리 (`SupplierLedger`/`Expense` 기록)
- 마진 리포트(`/api/reports/margin`)
- 입고 후기입 시 `Expense` (SHIPPING category) 기록 — 헤더 `shippingCost` 기준으로만 동작 (품목 override 는 cost-of-goods 로 흡수, 별도 expense 기록 안 함)

## 테스트 시나리오 (수동 검증)

1. 거래처상품 A에 입고 3건 (5000/6000/0) → 로트 3개 별도 unitCost 확인
2. A,B,C 묶인 전표 확정 후 후기입에서 A에만 6000 입력 → A의 unitCostSnapshot만 변동, B/C는 분배 분모가 줄어 운임이 늘어남
3. 판매 → FIFO 순서대로 로트별 다른 원가 소진
4. 거래처상품 상세 → "입고 배송비 이력" 5건 표시 + 출처 라벨 정확
5. 이력 박스 행 클릭 → 인라인 popover로 즉시 수정 → 같은 전표 다른 품목 영향 확인
6. 내상품 상세 → 매핑된 공급상품마다 이력 박스 노출
7. IncomingCost 등록 시 "택배비" 입력 → 400 에러로 차단됨

## 알려진 한계

- 마진 시뮬레이션 (상품 등록 폼/베이스라인 마진) 에서 배송비 미반영 → 입고 1회 발생 시점부터 자동으로 정확해짐 (로트 unitCost 가중평균이 정답)
- 모든 품목이 override 인 전표는 `Incoming.shippingCost` 분배가 사라짐 — UI 표시 의도된 동작이지만 운영자가 인지해야 함

---

# 후속 결정 사항 (2026-04 이후)

초기 설계 후 종합 검토를 거치며 추가된 결정/구현 사항.

## 결정 사항 요약

| 번호 | 항목 | 결정 |
|---|---|---|
| #1 | 평균 배송비 0원 행 처리 | **포함** (정기 배송 0원도 실질 평균에 반영) |
| #2 | lot 테이블 단위 | 매핑된 lot 의 `shippingPerUnit` 을 `÷ conversionRate` 로 product 단위 환산 |
| #3 | 차감 배지 | override 행에는 "거래처 차감" 배지 미표시 |
| #9 | 기존 IncomingCost 정리 | 거래처상품 상세에 안내 1줄 + 사용자 수동 정리 |
| #10 | itemShippingCost 회계 분류 | `Expense.SHIPPING` 통합 기록 (헤더+품목 합) |
| A | DEDUCTED 행 평균 처리 | 평균 분모에서 **제외** (거래처 부담은 우리 운임 아님) |
| B | canonical 변형 lot conv | 변형들의 매핑까지 fetch 해서 conversionRate 환산 |
| 추가 A | OrderItem.unitCostSnapshot null 폴백 | 마진 리포트에 `missingCostCount` 노출 + 경고 배너 + 주문 확정 시 console.warn |
| 추가 B | PDF 배송비 표시 | 거래명세표 PDF 에 품목별 운임 **미표시** (내부 회계와 거래 금액 분리) |
| 추가 C | `Inventory.avgCost` UI 라벨 | "(참고)" + "캐시값 — FIFO 미반영" 명시 |

## 배송비 회계 분류

| 입력 | unitCostSnapshot 반영 | Expense.SHIPPING 기록 | SupplierLedger 차감 |
|---|---|---|---|
| `Incoming.shippingCost` (헤더, 우리 부담) | ✓ 분배 | ✓ 합계 행 | — |
| `Incoming.shippingCost` (헤더, `shippingDeducted=true`) | ✗ (거래처 부담) | ✓ recoverable=true | ✓ 차감 |
| `IncomingItem.itemShippingCost` (품목 직접) | ✓ 그 품목 한정 | ✓ 합계 행에 포함 | — (항상 우리 부담) |

**경계**: 헤더 차감 + 품목 직접 운임 동시 존재 → `Expense.SHIPPING` 2건 분리 기록 (헤더용 recoverable=true + 품목용 recoverable=false). [src/lib/incoming-recalc.ts](../src/lib/incoming-recalc.ts) `recalcIncomingExpense` 참조.

## 평균 배송비 정책

[src/lib/cost-utils.ts](../src/lib/cost-utils.ts) `computeSupplierProductAvgShipping`:

- **포함**: 0원 행 (정기 배송 0원), 분배 헤더 운임, 품목 직접 운임
- **제외**:
  - `qty === 0` (개당 환산 무의미)
  - `shippingDeducted=true` 분배 행 (거래처 부담)

ShippingHistoryCard 의 자체 산술평균 계산도 **DEDUCTED 행 제외** 후 평균 → API 평균과 분모 일치. 단지 카드는 VAT 포함 표시, 계산기는 ÷1.1 공급가액. 라벨 "(VAT포함, 계산기 반영)" 로 단위 차이 명시.

## 입고 반품 / 실사보정 정책

- **입고 반품 (`SupplierReturn`)**: lot `remainingQty` 만 차감, `unitCost` 보존. 반품 품목의 배송비는 이미 `unitCostSnapshot` 에 흡수되어 있어 별도 처리 불필요. `Expense.SHIPPING` 도 변동 없음 (반품해도 운임은 발생함)
- **실사보정 (`Stocktake`)**:
  - diff > 0 → 새 ADJUSTMENT 로트, `unitCost = 잔여 로트 가중평균`. 별도 배송비 입력 없음 (보정으로 들어온 로트는 운임 발생 안 한 것으로 간주)
  - diff < 0 → FIFO 차감, 기존 정책 그대로
- **매핑 변경**: 오르판 lot 의 `productId` 만 할당, `unitCost` 보존. 배송비는 이미 unitCostSnapshot 에 박혀 있음

## PDF 정책

[src/components/document-pdf.tsx](../src/components/document-pdf.tsx):

- 매입/매출 **거래명세표 PDF** 는 거래 금액(단가/공급가액/세액/합계) 만 표시
- 헤더 운임 (`Incoming.shippingCost`) 은 거래에 청구된 운임이면 별도 행 표시 가능 (선택)
- **품목별 운임 (`itemShippingCost`)** 은 우리 내부 회계 분류용이므로 **PDF 에 표시하지 않음**. 거래처와의 거래 금액에 영향 없음
- 운임 합계 리포트가 필요하면 `/api/reports/margin` 또는 별도 회계 리포트에서 `Expense.SHIPPING` 합계 조회

## OrderItem.unitCostSnapshot 누락 처리

[src/app/api/reports/margin/route.ts](../src/app/api/reports/margin/route.ts):

- LotConsumption 도 unitCostSnapshot 도 없는 항목 → cost = 0 으로 처리하되 `missingCostCount` 카운트
- 응답에 `missingCostCount`, `missingCostOrderIds[]` 포함
- 마진 리포트 UI 가 경고 배너 노출

[src/app/api/orders/[id]/route.ts](../src/app/api/orders/[id]/route.ts) 주문 확정:
- `unitCostSnapshot` 이 null 이면 `console.warn` 로그 (가시성 확보)

## 함수 도큐멘트

- **`computeSupplierProductAvgShipping`** ([cost-utils.ts](../src/lib/cost-utils.ts)) — 시뮬레이션/계산기 추천값. 실제 원가는 `unitCostSnapshot` / `InventoryLot.unitCost` 기반
- **`computeShippingPerUnitDisplay`** ([incoming-shipping.ts](../src/lib/incoming-shipping.ts)) — 화면 표시용 effective 값. 우선순위 + 출처 라벨 (ITEM/ALLOCATED/DEDUCTED/ZERO)
- **`computeShippingNetPerUnit`** ([incoming-shipping.ts](../src/lib/incoming-shipping.ts)) — 입고 확정 시 분배 계산 (공급가액). itemShippingCost 우선 + 분배 (override 제외 분모) + 차감 처리
- **`recalcIncomingShippingSnapshots`** ([incoming-recalc.ts](../src/lib/incoming-recalc.ts)) — 입고 변경 시 모든 `unitCostSnapshot` + `InventoryLot.unitCost` 일괄 재계산
- **`recalcIncomingExpense`** ([incoming-recalc.ts](../src/lib/incoming-recalc.ts)) — 헤더+품목 운임 합계로 `Expense.SHIPPING` 통합 기록. 차감 + 품목 직접 동시 시 분리 기록

## FAQ

**Q: 배송비를 누락하고 입고 확정했어요. 어떻게 수정하나요?**
A: 세 가지 경로:
1. 입고 전표 → 후기입 다이얼로그 ("택배비 수정") → 헤더 또는 품목별 운임 입력
2. 거래처상품 상세 → "입고 배송비 이력" → 행 옆 연필 아이콘 → 인라인 popover 로 `itemShippingCost` 즉시 수정
3. 내상품 상세 → 같은 이력 카드에서도 동일 수정 가능

**Q: 거래처가 운임을 부담했는데 평균에 들어가나요?**
A: 아니요. `shippingDeducted=true` 인 분배 행은 평균 분모에서 제외됩니다. 우리 부담이 아니므로.

**Q: 정기 배송으로 0원이었는데 평균에 들어가나요?**
A: 들어갑니다. 실제 우리 운임이 0원이었던 회차는 "정상 0원" 이므로 평균 분모에 포함되어 실질 평균이 산출됩니다.

**Q: 구주문의 마진이 이상해요.**
A: PR2 이전 주문은 `LotConsumption` 도 `unitCostSnapshot` 도 없을 수 있어 cost=0 으로 잡힙니다. 마진 리포트 상단의 누락 경고를 확인하세요. 누락된 주문 ID 는 응답의 `missingCostOrderIds` 에 노출됩니다.

**Q: `Inventory.avgCost` 숫자가 로트 평균과 다른데요.**
A: `avgCost` 는 deprecated 캐시값입니다. 실제 원가는 `InventoryLot.unitCost` 기반 FIFO 가중평균을 보세요. UI 라벨에도 "(참고)" 가 붙어 있습니다.

## 운영 체크리스트

**입고 등록 시**:
- ✅ 헤더 운임 또는 품목별 운임 둘 중 하나만 입력 (이중계상 방지)
- ✅ 거래처 차감일 때 헤더에서 `shippingDeducted` 체크
- ✅ 품목별로 다른 운임이 있을 때만 `itemShippingCost` 사용

**부대비용 등록 시**:
- ❌ "배송비/택배비/운임" 키워드 사용 금지 (자동 차단됨)
- ✅ 부대비용은 포장비/검수비/통관비 등 비배송 항목만

**입고 매핑 변경 시**:
- ✅ 매핑된 lot 의 `unitCost` 는 보존됨 (배송비 재계산 안 됨)
- ✅ 새 입고부터 새 매핑 적용

**마진 리포트 확인 시**:
- ✅ `missingCostCount > 0` 경고 배너 확인
- ✅ 누락된 주문은 별도 추적 (수동 보정 또는 데이터 백필)
- 인라인 popover 는 한 행씩 저장 → 여러 품목 동시 수정은 후기입 다이얼로그가 더 효율적
