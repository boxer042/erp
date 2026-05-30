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

## 7. 재고 · 결제 함의

- A 라인: IN_STORE 즉시 차감 + COMPLETED (현행 그대로).
- B 라인: SHIPPING → PENDING/PREPARING. 품절이면 `allowNegativeStock=ON` 시 **deficit-lot(음수 재고)** 생성 — 이미 결제받았으므로 음수재고 감수가 타당. 추후 입고 시 deficit 는 **자동 상쇄 안 됨**(실사보정으로 정산) — backorder 라인과 미래 입고 간 링크 없음(현행 한계, 분할출고 범위 밖이나 인지 필요).
- ⚠️ `allowNegativeStock=OFF` 매장: 품절 B 결제가 **차단** → 분할출고 시나리오 불성립. 이 경우 **B 를 '주문(PENDING, 미차감)' 으로만 받고 결제는 A 만** 하는 별도 정책 필요(D-2 연동).

## 8. 미해결 결정 (구현 착수 전)

- **D-4-a 결제 배분**: 단일 결제를 대표 주문에 전액 귀속 vs 라인별 안분. (권장: 대표 주문 전액 귀속 + 그룹 합계 원장 1회 — 단순·정합)
- **D-4-b 증빙**: 거래명세표/영수증을 splitGroup 합계로 1장 발행 vs 주문별 발행. (권장: 그룹 1장 + 출고분 별도 송장)
- **D-4-c 클레임/반품**: 그룹 단위 반품 시 동작. ORDERS_SYSTEM.md §8 의 `parentItemId` cascade 정책 미정과 연동 — **분할출고 1차 범위에서 제외**, 후속.
- **OFF 매장 정책**(7번): 품절 B 결제 차단 매장의 분할출고 대안 확정.

## 9. 구현 로드맵 (P5, 보류 중)

1. 스키마 `splitGroupId`/`splitParentId` + `db push`.
2. 카트 라인 per-line "지금 받기/나중 배송" 토글(`headerBelow` 슬롯).
3. 체크아웃 라인 파티션 → N Order 생성 + splitGroup 링크 + 단일 결제 배분(D-4).
4. 거래명세표/영수증 그룹 집계, 상세 시트 "연결 주문" 표시(exchange UI 재사용).
5. deficit-lot/입고 정산은 현행 한계 유지(범위 밖).

**키 파일**: `prisma/schema.prisma`, `src/app/api/pos/checkout/route.ts`, `src/app/api/orders/route.ts`, `src/app/(dashboard)/orders/_detail-sheet.tsx`, `src/app/(dashboard)/orders/page.tsx`, `src/lib/validators/order.ts`.
