# 분할 출고 (Split Fulfillment) 설계

> 상태: **설계 확정 / 구현 보류** (사용자 결정 2026-05-30). 구현은 별도 트랙(로드맵 P5).
> 관련: [ORDERS_SYSTEM.md](ORDERS_SYSTEM.md) 3축 모델, [POS.md](POS.md) 결제 흐름.

## 1. 문제 (점4)

한 번의 결제(매장 즉시판매)에서 품목이 **혼합 출고**되는 케이스:

> A 상품·B 상품을 함께 계산했는데, **B가 품절**이라 A는 손님이 지금 가져가고 **B는 입고 후 택배로** 보내야 한다.

즉 **하나의 결제 / 하나의 카트**가 → **일부는 매장 수령(IN_STORE, 즉시 종결) + 일부는 택배(SHIPPING, 추후 출고)** 로 갈라진다.

## 2. 현재 모델로는 표현 불가 (확인된 사실)

- `Order.fulfillmentType` 은 **주문당 스칼라 1개** (`prisma/schema.prisma` Order). `OrderItem` 에는 per-line fulfillment 필드가 **없다**.
- `OrderStatus` 도 **주문 단일 상태** — "A 픽업완료 + B 배송중" 을 한 주문에서 동시 표현 불가.
- 기존 `Shipment`/`ShipmentItem`/`shippedQty` 는 **동일 fulfillment 내 수량/라인 분할**(같은 택배 트랙)만 처리 — 매장수령 vs 택배의 혼합은 못 다룸.

## 3. 채택 방식 — **연결된 두(N) 주문** (`splitGroupId`)

3안 비교:

| 안 | 모델 변경 | blast radius | 결론 |
|---|---|---|---|
| A. per-OrderItem fulfillment + 라인 lifecycle | OrderItem enum 2개, `Order.status` 를 라인 roll-up 으로 강등 | 거대 — 상태머신·상세시트 footer·워크보드 컬럼·마진/판매내역·3축 doctrine 전면 개조 | ❌ |
| **B. 연결된 N 주문** | `Order.splitGroupId`/`splitParentId` self-relation 1개 (교환 `exchangeOrderId` 선례) | 작음·additive — 상태머신/footer/워크보드/마진 **무변경** | ✅ **채택** |
| C. Fulfillment/Shipment sub-entity | `Shipment` 에 type+status + order roll-up | A 와 동일하게 `Order.status` 강등 필요 | ❌ (장기 정론이나 과함) |

**B 채택 이유**: 각 주문이 **자기 자신의 유효한 `fulfillmentType` + lifecycle** 를 그대로 유지 → 상태머신·상세시트·워크보드·마진 리포트 코드 변경 0. A 는 `IN_STORE` 즉시 `COMPLETED`, 품절 B 는 `SHIPPING` `PREPARING` 에 머물다 입고 후 출고. 음수재고(deficit-lot) 메커니즘이 B 품절을 이미 커버. 검증된 self-relation 패턴(`exchangeOrderId`) 재사용.

## 4. 스키마

```prisma
model Order {
  // ...
  // 분할 출고 — 같은 결제가 매장수령/택배 등으로 갈릴 때 연결 (교환 exchangeOrderId 선례와 동형)
  splitGroupId  String?  @map("split_group_id")   // 같은 분할 그룹 공유 (= 대표 주문 id)
  splitParentId String?  @map("split_parent_id")
  splitParent   Order?   @relation("OrderSplit", fields: [splitParentId], references: [id])
  splitChildren Order[]  @relation("OrderSplit")
  @@index([splitGroupId])
}
```

- 대표 주문(매장 수령 A) 이 그룹 루트. 자식 주문(택배 B) 이 `splitParentId` 로 연결, 둘 다 `splitGroupId = 대표 id`.
- `prisma db push` + `prisma generate` 만으로 적용 (마이그레이션 경량).

## 5. API

`/api/pos/checkout` (+ B2B `/api/orders`) 체크아웃을 라인 파티션으로 확장:

- 카트 라인에 per-line target 추가: `lineFulfillment: "take_now" | "ship_later"` (또는 `takeNow: boolean`).
- 체크아웃 트랜잭션 안에서 라인을 **2그룹으로 분할** → **N개 Order 생성**, 모두 `splitGroupId` 공유:
  - `take_now` 묶음 → `fulfillmentType=IN_STORE`, `status=COMPLETED`, 재고 즉시 차감 (현행 IN_STORE 경로 그대로).
  - `ship_later` 묶음 → `fulfillmentType=SHIPPING`, POS 는 `PREPARING`(즉시 차감) / orders 는 `PENDING`(검수 후 차감) — **각 경로의 기존 정책 유지**.
- **결제는 단일** — 대표 주문(A)에 전체 `paidAmount` 귀속, B 는 `paymentStatus=PAID` + `paidAmount=0`(이미 받음) 으로 생성. (배분 방식은 D-4 결정)
- `CustomerLedger` SALE/RECEIPT 은 **그룹 합계로 1회** 기록.
- 거래명세표/영수증은 **splitGroup 단위 집계** 발행 (현재 per-order `issue-statement`/`pos-receipt` 를 그룹 인지로 확장).

## 6. UI

- POS·orders 카트 라인에 **"지금 받기 / 나중에 배송"** per-line 토글 — `PosLineItemRow.headerBelow` 슬롯 활용(추가 추출 불필요).
- 혼합 감지 시 결제 시트에 안내: "이 주문은 **매장 수령 N건 + 택배 N건** 으로 분할됩니다".
- 워크보드/판매내역에서 splitGroup 묶음 표시. 상세 시트에 **"연결 주문"** 링크 — 교환 `exchangeOrderId` UI 재사용.

## 7. 재고 · 결제 (결정 확정 2026-05-31)

- **A 라인 (지금 받기)**: `IN_STORE` 즉시 차감 + `COMPLETED`. 단일 결제 **전액을 A(대표 주문)에 귀속**. CustomerLedger SALE/RECEIPT 은 그룹 합계로 A 에 1회.
- **B 라인 (나중 배송)**: `SHIPPING` + **`PENDING`(재고 미차감)** + `paymentStatus=PAID` + `paidAmount=0`(A 에서 이미 수금). 즉 **백오더** — 일반 PENDING SHIPPING 주문으로 워크보드에 진입.
  - B 는 **deficit-lot(음수재고)을 만들지 않는다.** `allowNegativeStock` 설정과 **무관**(ON/OFF 모두 동일 동작) — 차감을 아예 안 하므로.
  - B 실제 출고는 매장 운영대로 **① 입고 후 출고**(재고 입고 → `prepare` 시 FIFO 차감 → 출고) 또는 **② 거래처 직출고**(공급사에서 손님에게 직배 — 이 경우 매장 재고 차감 없이 출고 처리). 두 경로 모두 기존 주문 워크보드 흐름으로 처리.
  > 운영 맥락(사용자): 현재 재고 실사 미완으로 oversell(선출고)을 허용 중이나, **실제 분할출고는 음수재고가 아니라 입고후 출고/거래처 직출고로 처리**한다. 따라서 B 는 차감 없는 PENDING 백오더가 정답.

## 8. 결정 (확정) / 범위 밖

- **D-4-a 결제 배분** → ✅ **대표 주문(A) 전액 귀속** + 그룹 합계 원장 1회.
- **D-4-b 증빙** → ✅ **splitGroup 합계 거래명세표/영수증 1장** (출고분 송장만 B 에 별도).
- **OFF 매장 정책** → ✅ B 가 항상 미차감 PENDING 이라 `allowNegativeStock` 무관 — 별도 분기 불필요.
- **D-4-c 클레임/반품** → 그룹 단위 반품은 **1차 범위 제외**(후속). ORDERS_SYSTEM.md §8 `parentItemId` cascade 정책과 연동.
- **거래처 직출고 자동화**(공급사 발주 연계) → 1차 범위 제외. 1차는 B 를 수동 PENDING 으로 두고 매장이 입고/직출고 결정.

## 9. 구현 현황 (2026-05-31 — 주문페이지 + POS + 증빙 완료)

> 결제·원장 배분은 최종 **주문별 자체 결제**(각 주문 자기 품목 결제·원장)로 확정 — 7·8절 D-4-a 의 "A 전액 귀속" 은 대체됨. 각 주문이 독립 정합이라 백엔드 트랜잭션/원장 리팩터 0.

**주문페이지(`orders/new`)**
- ✅ **스키마** `Order.splitGroupId`/`splitParentId` self-relation + `@@index` + `db push`.
- ✅ **백엔드 수용** `orderSchema` + `/api/orders` `order.create` 에 split 링크 저장(B 는 SHIPPING→PENDING 미차감 백오더로 정상 생성).
- ✅ **카트 UI** 상품 라인별 [지금 받기/나중 배송] `JmSegmentedControl` + "택배 나중 배송" 배지 + 결제단계 분할 안내 카드.
- ✅ **오케스트레이션** mixed 면 프론트가 A(지금/대표, 전역 출고방식·세션할인·배송비) → B(나중/SHIPPING PENDING, 자기 품목·결제수단 상속, splitParentId=A.id) 2건 순차 등록. 단일 payload byte-identical. 부분결제+분할 동시 가드.
- ✅ **연결 주문** 상세 GET include + `_detail-sheet` "연결 주문 · 분할 출고" 카드(대표↔백오더 상호 link).

**POS 경로(`/pos`)**
- ✅ **카트 토글** `_cart-line-row` 상품 라인 [지금 받기/나중 배송] + 배지(수리/임대/서비스/ADDON 제외). `laterIds` 는 `customer/[sid]/page` 가 보유 → CartSheet·PaymentSheet 양쪽 prop.
- ✅ **오케스트레이션** `_payment-sheet`: A 는 `/api/pos/checkout`(splitGroupId 부여, **기존 트랜잭션 불변** — repair/rental/PosSession/세션삭제 그대로) + B 는 `/api/orders` SHIPPING PENDING 백오더(splitParentId=A.id). **B 실패 비치명적**(A 완료 후 경고). 라벨 A/B 분리 발번. 부분결제+분할 가드. 비분할 payload byte-identical.
- ✅ **route 수용** `/api/pos/checkout` + `checkout-submit` 가 splitGroupId 저장(A=대표).

**증빙**
- ✅ **그룹 1장** `(print)/order-statement` + `(print)/pos-receipt` 가 `splitGroupId` 형제(대표 먼저) 모아 items concat + 합계 Σ. 영수증 배송 섹션은 택배(B) 기준 + "분할 출고" 안내. 비분할 byte-identical. 정식 Statement 레코드(`issue-statement`)는 per-order 1:1 유지.

**e2e**: `e2e/order-new.spec.ts`(분할 토글→배지→안내 4 pass) + `e2e/split-fulfillment.spec.ts`(A+B 링크·B=PENDING·증빙 합산 백엔드 검증).

**남은 작업** (후속, 1차 범위 밖):
- ⏸ **D-4-c 그룹 클레임/반품 cascade** — A·B 는 별개 주문이라 **per-order 반품/교환은 기존 워크보드 흐름으로 이미 동작**. "A 반품 시 B 자동 반품" 같은 그룹 cascade 만 미구현(ORDERS_SYSTEM.md §8 `parentItemId` 정책 연동).
- ⏸ **거래처 직출고 자동화** — B 백오더의 공급사 발주 자동 연계(현재는 매장이 입고/직출고 수동 결정).

**키 파일**: `prisma/schema.prisma`, `src/lib/validators/order.ts`, `src/app/api/orders/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/(dashboard)/orders/new/page.tsx`, `src/app/(dashboard)/orders/_detail-sheet.tsx`, `src/app/api/pos/checkout/route.ts`, `src/components/pos/checkout-submit.ts`, `src/app/(pos)/pos/_cart-line-row.tsx`, `src/app/(pos)/pos/_payment-sheet.tsx`, `src/app/(pos)/pos/customer/[sid]/page.tsx`, `src/app/(print)/order-statement/[id]/print/page.tsx`, `src/app/(print)/pos-receipt/[id]/print/page.tsx`.
