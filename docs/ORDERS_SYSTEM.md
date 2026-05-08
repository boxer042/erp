# 주문(Order) 시스템 설계

> 2026-05-07 재설계. 출고 5단계·결제·반품/교환 5단계 + 클레임 분기 + 교환 자동화.
>
> 코드 진입점: [src/app/(dashboard)/orders/](../src/app/(dashboard)/orders/) · [src/app/api/orders/](../src/app/api/orders/) · [prisma/schema.prisma](../prisma/schema.prisma) (`Order` 모델)

---

## 1. 도메인 모델 — 3개 직교 축

기존엔 `OrderStatus` 한 축에 출고·결제·반품이 섞여 표현이 부족했음. 다음 **3축으로 분리**해 직교적으로 추적:

| 축 | 필드 | 추적 대상 |
|---|---|---|
| **출고** | `OrderStatus` | 물리적 흐름 — 재고가 어디 있고 손님이 받았는지 |
| **결제** | `paymentStatus` | 재무 흐름 — 돈을 받았는지/환불·매출취소 |
| **클레임** | `claimType` + `claimReason` | 의도 — 환불인지 교환인지, 누가 책임인지 |

같은 주문이 동시에 `PREPARING` (출고: 출고대기) + `UNPAID` (결제: 외상) 일 수 있음.

### 축 1. 출고 (`OrderStatus`) — 5단계 + 반품/교환 5단계

```
출고 흐름:
  PENDING(주문/접수) → PREPARING(출고대기) → PREPARING_PACKED(출고확정)
    → SHIPPED(배송중) → COMPLETED(배송완료)

취소: PENDING/PREPARING → CANCELLED (출고대기까지만, 출고확정 후 송장 발급으로 반품 흐름)

반품/교환 흐름 (claimType 으로 분기):
  COMPLETED → RETURN_REQUESTED → RETURN_ACCEPTED
    → RETURN_COLLECTED → RETURN_INSPECTED
    → RETURNED (반품완료) 또는 EXCHANGED (교환완료 + 새 주문 -EX 자동 생성)

  RETURN_REQUESTED → 반려 → COMPLETED (자진 취소도 동일)
```

| 상태 | 라벨 (동적) | 의미 | 재고 |
|---|---|---|---|
| `PENDING` | "주문" (channelId 있음) / "접수" (없음) | 외부 채널 import / 매장 접수 | 미차감 |
| `PREPARING` | "출고대기" | 재고 차감됨, 포장·송장 대기 (취소 가능 마지막 단계) | **차감** |
| `PREPARING_PACKED` | "출고확정" | 포장·송장 입력 완료, 발송 직전 (취소 불가) | 차감 |
| `SHIPPED` | "배송중" | 택배 인계 / 배달 출발 | 차감 |
| `COMPLETED` | "배송완료" | 인도 종결 | 차감 |
| `RETURN_REQUESTED` | "반품요청" / "교환요청" | 손님 요청, 매장 결정 대기 | 차감 |
| `RETURN_ACCEPTED` | "반품 회수대기" / "교환 회수대기" | 매장 수락 후 회수 대기 | 차감 |
| `RETURN_COLLECTED` | "회수완료" | 물품 도착, 검수 대기 | 차감 |
| `RETURN_INSPECTED` | "검수완료" | 검수 통과, 환불/교환 종결 대기 | 차감 |
| `CANCELLED` | "취소" | 취소 종결 | 복원 (PREPARING이었으면) |
| `RETURNED` | "반품완료" | 재고 복원 + 환불(또는 매출취소) | **복원** |
| `EXCHANGED` | "교환완료" | 재고 복원 + 새 주문(-EX) 자동 생성 | **복원** |

라벨은 `statusLabel(status, { channelId, claimType })` 함수로 동적 결정.

### 축 2. 결제 (`paymentStatus`)

| 값 | 라벨 | 의미 |
|---|---|---|
| `UNPAID` | "외상" | 미수금 |
| `PAID` | "결제완료" | 결제 완료 |
| `REFUND_PENDING` | "환불진행" | 검수 후 PG/은행 처리 대기 |
| `PARTIAL_REFUND` | "부분환불" | enum 정의만 (부분 처리 도입 시) |
| `REFUNDED` | "환불완료" | 전액 환불 완료 |
| `SALES_CANCELLED` | "매출취소" | 외상 주문 반품 — 환불 없이 ledger 잔액 0 처리 |

자동 산출:
- 주문 생성 시: `paymentMethod` 가 UNPAID/null → `UNPAID`, 그 외 → `PAID`
- `inspect_return` 액션: PAID → REFUND_PENDING (환불 절차 시작 표시)
- `cancel`/`refund`/`return` 액션:
  - PAID/REFUND_PENDING → REFUNDED (환불 완료)
  - UNPAID → SALES_CANCELLED (매출 취소)
- `exchange` 액션: 그대로 유지 (차액은 새 주문에서 정산)
- `customerPayment` 등록: FIFO 로 UNPAID 주문 자동 PAID 전이

### 축 3. 클레임 (`claimType` + `claimReason`)

`OrderClaimType` (3가지):
- `REFUND` — 환불
- `EXCHANGE_SAME` — 같은 상품 재발송
- `EXCHANGE_DIFFERENT` — 다른 상품으로 교체

`OrderClaimReason` (6가지):
- `DEFECTIVE` (불량) — 매장 책임
- `DAMAGED_IN_TRANSIT` (배송 파손) — 매장 책임
- `WRONG_ITEM` (오배송) — 매장 책임
- `CHANGE_MIND` (단순 변심) — 손님 책임
- `SIZE_COLOR` (사이즈/색상) — 분담
- `OTHER` — 분담

`request_return` 액션 시 입력. RETURN_REQUESTED 단계에서 매장이 변경 가능.

---

## 2. API 액션 매핑

`PUT /api/orders/[id]` — body `{ action, ...payload }`

| action | 전이 | 부수효과 |
|---|---|---|
| `prepare` | PENDING → PREPARING | **재고 차감** (FIFO + LotConsumption) + cost snapshot |
| `pack` | PREPARING → PREPARING_PACKED | 송장 정보 저장 (선택) |
| `ship` | PREPARING_PACKED → SHIPPED | trackingCarrier/Number + adapter.pushTrackingNumber() 자동 호출 |
| `complete` | SHIPPED → COMPLETED | — |
| `cancel` | PENDING/PREPARING → CANCELLED | 재고 복원 (PREPARING) + paymentStatus 전이 |
| `request_return` | COMPLETED → RETURN_REQUESTED | claimType (필수) + claimReason + reason 메모 저장 |
| `accept_return` | RETURN_REQUESTED → RETURN_ACCEPTED | 매장 수락 + adapter.acceptReturn() 호출 |
| `reject_return` | RETURN_REQUESTED → COMPLETED | 매장 반려 + adapter.rejectReturn() 호출 + claim 정보 보존 |
| `cancel_return_request` | RETURN_REQUESTED → COMPLETED | 자진 취소 — claim 정보 클리어 |
| `collect_return` | RETURN_ACCEPTED → RETURN_COLLECTED | 물품 회수 확인 |
| `inspect_return` | RETURN_COLLECTED → RETURN_INSPECTED | 검수 통과 + paymentStatus PAID → REFUND_PENDING |
| `refund` | RETURN_INSPECTED → RETURNED | **재고 복원** + paymentStatus 전이 (PAID/REFUND_PENDING → REFUNDED, UNPAID → SALES_CANCELLED) |
| `return` | COMPLETED / RETURN_* → RETURNED | 즉시 반품 단축 경로 (위와 동일 부수효과) |
| `exchange` | RETURN_ACCEPTED 이후 → EXCHANGED | **재고 복원** + **새 주문(-EX) 자동 생성** + 양방향 link, paymentStatus 유지 |

### 단축 경로

매장에서 손님이 즉석 처리 시: COMPLETED 에서 `return` 직접 호출 → RETURNED. claimType=REFUND 자동.

---

## 3. 교환 자동화 — 새 주문 생성 메커니즘

`exchange` 액션 호출 시 트랜잭션 내에서 새 Order 자동 create.

**주문번호**: 원본 + `-EX` 접미사 (예: `ORD250507-AB12-EX`).

### EXCHANGE_SAME (같은 상품)
- 항목 = 원본 항목 그대로 복제
- `totalAmount` = 원본과 동일
- `paymentStatus = PAID` (이미 결제됨)
- 마진 리포트에서 자동 제외 (`exchangedFromOrders: { none: {} }` 필터)

### EXCHANGE_DIFFERENT (다른 상품)
- 항목 = **빈 배열** (사용자가 OrderItem 편집 UI 로 채움)
- `totalAmount` = 0, `paymentStatus = UNPAID`
- 사용자 항목 등록 후 차액 자동 계산 (`ExchangeReplacementCard`)

### 양방향 link (스키마)
```prisma
exchangeOrderId      String?  @unique   // 원본 → 새 주문 (정방향)
exchangeOrder        Order?   @relation("OrderExchange", ...)
exchangedFromOrders  Order[]  @relation("OrderExchange")  // reverse
```

### 새 주문(-EX) 색 분리

새 주문의 PENDING/PREPARING/SHIPPED/COMPLETED 단계 색은 **accent(보라)** 로 표시 — 일반 출고(파랑)와 시각적으로 구분. `isExchangeReplacement = exchangedFromOrders.length > 0`.

---

## 4. UI 시각 위계

### 흐름별 색 통일

| 흐름 | 진행 중 색 | 종결 색 |
|---|---|---|
| **출고** | `info` (파랑) | `success` (초록) — COMPLETED |
| **반품** (claimType=REFUND) | `warning` (노랑) | `outline` — RETURNED |
| **교환** (claimType=EXCHANGE_*) | `accent` (보라) | `outline` — EXCHANGED |
| **교환 새 주문 (-EX)** | `accent` (보라) | `outline` — COMPLETED |
| **취소** | — | `outline` — CANCELLED |

같은 흐름 내 단계는 색 통일, 텍스트로 단계 구분.

`accent` 토큰 신규 (jm/tokens.css):
```css
--jm-accent-bg: oklch(0.95 0.06 295);   /* light 보라 */
--jm-accent-fg: oklch(0.45 0.18 295);   /* dark 보라 */
```

### 워크보드 컬럼

```
주문번호 | 상태 | 출고 | 채널 | 고객/항목 | 출고예정 | 합계 | 결제 | 액션
```

- **상태**: StatusBadge — 동적 색·라벨
- **출고예정**: 출고 흐름이면 D+N / 오늘 / 지연. 반품 처리 단계면 단계 텍스트 ("결정 대기" / "회수 대기" / "검수 대기" / "종결 대기")
- **결제**: PaymentStatusBadge `showPaid=true` — 모든 행에 dot (외상=빨강, 결제완료=초록, 환불진행=노랑)
- **합계**: 단순 금액. REFUNDED·SALES_CANCELLED·PARTIAL_REFUND 만 line-through

### 액션 footer (상세 시트)

| 현재 상태 | 노출 버튼 |
|---|---|
| PENDING | [취소] [출고대기] |
| PREPARING | [취소] [출고확정] |
| PREPARING_PACKED | [발송] |
| SHIPPED | [배송완료] |
| COMPLETED | [즉시 반품] [반품/교환 요청] |
| RETURN_REQUESTED | [요청 취소] [반려] [수락] |
| RETURN_ACCEPTED | [회수완료] |
| RETURN_COLLECTED | [검수완료] |
| RETURN_INSPECTED | [반품완료] / [교환완료] (claimType 따라 강조) |
| CANCELLED/RETURNED/EXCHANGED | "종결된 주문입니다" |

### 워크보드 그룹

`returnPending` 그룹에 RETURN_REQUESTED/ACCEPTED/COLLECTED/INSPECTED 모두 포함. 출고 그룹은 PENDING/PREPARING/PREPARING_PACKED + 날짜로 분류.

---

## 5. 운영 시나리오

### A. 정상 출고
```
POS DELIVERY 결제 → PREPARING (즉시 재고 차감)
워크보드 [출고확정] → PREPARING_PACKED (송장 입력)
워크보드 [발송] → ShipDialog → SHIPPED + 채널에 송장 자동 push
워크보드 [배송완료] → COMPLETED
```

### B. 반품 (불량, 매장 환불)
```
1. COMPLETED → 손님 "불량" 신고
2. ClaimRequestDialog → claimType=REFUND, reason=DEFECTIVE → RETURN_REQUESTED
3. [수락] → RETURN_ACCEPTED + 채널에 acceptReturn 자동 통보
4. 회수 도착 → [회수완료] → RETURN_COLLECTED
5. 검수 통과 → [검수완료] → RETURN_INSPECTED + paymentStatus REFUND_PENDING
6. [반품완료] → RETURNED + 재고 복원 + paymentStatus REFUNDED
```

### C. 외상 반품 (매출 취소)
```
1. UNPAID 주문 외상 출고 → COMPLETED
2. 손님 반품 요청 → RETURN_REQUESTED → ... → RETURN_INSPECTED
3. [반품완료] → RETURNED + 재고 복원 + paymentStatus SALES_CANCELLED
   (환불 없음. customer ledger 의 SALE 잔액은 별도 조정)
```

### D. 교환 (다른 상품)
```
1. COMPLETED → ClaimRequestDialog → claimType=EXCHANGE_DIFFERENT, reason=CHANGE_MIND → RETURN_REQUESTED (보라)
2. [수락] → RETURN_ACCEPTED (보라)
3. [회수완료] → RETURN_COLLECTED
4. [검수완료] → RETURN_INSPECTED
5. [교환완료] → ExchangeDialog → SAME/DIFFERENT 선택 → EXCHANGED
6. 새 주문 ORD...-EX 자동 생성 (PENDING, 빈 항목, paymentStatus=UNPAID, totalAmount=0, 보라색)
7. 사용자가 OrderItem 편집 UI 로 새 항목 등록 → 차액 자동 계산
8. 손님 차액 결제 → customerPayment 등록 → 자동 PAID
9. 새 주문 워크보드 진입 → [출고대기] → [출고확정] → [발송] → [배송완료] (모두 보라)
```

---

## 6. 데이터 모델 (Order 신규 필드)

```prisma
enum OrderStatus {
  PENDING
  PREPARING
  PREPARING_PACKED   // 신규
  SHIPPED
  COMPLETED
  RETURN_REQUESTED
  RETURN_ACCEPTED
  RETURN_COLLECTED   // 신규
  RETURN_INSPECTED   // 신규
  CANCELLED
  RETURNED
  EXCHANGED
}

enum OrderPaymentStatus {
  UNPAID
  PAID
  REFUND_PENDING     // 신규
  PARTIAL_REFUND
  REFUNDED
  SALES_CANCELLED    // 신규
}

enum OrderClaimType { REFUND  EXCHANGE_SAME  EXCHANGE_DIFFERENT }
enum OrderClaimReason {
  DEFECTIVE  DAMAGED_IN_TRANSIT  WRONG_ITEM
  CHANGE_MIND  SIZE_COLOR  OTHER
}

model Order {
  status              OrderStatus         @default(PENDING)
  paymentStatus       OrderPaymentStatus  @default(UNPAID)
  paymentMethod       OrderPaymentMethod?

  claimType           OrderClaimType?
  claimReason         OrderClaimReason?
  returnReason        String?

  returnRequestedAt   DateTime?
  returnAcceptedAt    DateTime?
  returnRejectedAt    DateTime?
  exchangedAt         DateTime?

  // 양방향 self-relation
  exchangeOrderId     String?  @unique
  exchangeOrder       Order?   @relation("OrderExchange", fields: [exchangeOrderId], references: [id])
  exchangedFromOrders Order[]  @relation("OrderExchange")

  @@unique([channelId, channelOrderNo])  // 채널 import 중복 방지
}
```

---

## 7. 마진 리포트 정합성

`exchangedFromOrders: { none: {} }` 필터로 교환 발송 새 주문은 자동 제외 ([api/reports/margin/route.ts](../src/app/api/reports/margin/route.ts)).

---

## 8. 한계와 후속 작업

### 우선순위 높음 (도메인 정합성)

#### 1. 차액 결제 자동 청구·환불
- EXCHANGE_DIFFERENT 차액은 표시만. 실제 결제·환불은 매장 수동
- 알림 시스템 인터페이스 도입됨 → Phase 2 후 실 SaaS 어댑터 등록 시 차액 안내 자동화 가능

#### 2. 부분 처리 (부분 출고/반품/환불) — 후속 PR
- OrderItem 단위 status·shippedQty·returnedQty·refundedAmount 필요
- PARTIAL_REFUND 실사용 가능
- 외부 채널·B2B 에서 자주 발생
- 큰 작업: schema 변경 + LotConsumption 부분 복원 알고리즘 + UI 모두 재설계

#### 3. 다중·variant 매핑 — 후속 PR
- 한 채널 SKU 가 ERP 세트 상품 또는 variant 여러 개로 매핑
- 큰 작업: ChannelProductMapping 1:1 → 1:N + import.ts 풀어내기 알고리즘 + UI

### 우선순위 중간 (확장 기능)

#### 4. 외부 채널 자동화 — 단계별 로드맵

**Phase 1 — 도메인 layer (완료, 2026-05-07)**
- 어댑터 인터페이스 (`ChannelAdapter`), import 변환 로직, SKU 매핑 모델·UI, 보류 큐, Mock 어댑터
- `(channelId, channelOrderNo)` unique 인덱스로 중복 방지
- `/channels/imports` 페이지 (Import 트리거·보류 큐·SKU 매핑)

**Phase 2 — 실 채널 어댑터 (가입·API 키 후)** ⏸ 가입 대기
- `lib/channels/coupang.ts`, `naver.ts` 등 채널별 어댑터 구현
- OAuth 인증·토큰 갱신
- 채널 API 응답 → `RawChannelOrder` 매핑
- webhook signature 검증

**Phase 3 — 자동 트리거 인프라 (부분 완료, 2026-05-07)**
- ✓ Cron 라우트 (`/api/cron/channel-poll`)
- 남은 작업: webhook 라우트 scaffolding, retry 큐

**Phase 4 — Outbound 동기화 (부분 완료, 2026-05-07)**
- ✓ ERP 액션 직후 adapter.* 자동 호출 (best-effort)
- 남은 작업: 자동 retry 큐 (ChannelOutboundJob)

**Phase 5 — 채널 → ERP 역방향 자동화 (Inbound)** ⏸ Phase 2 의존
- 채널의 반품·정산 자동 ERP 전이

**Phase 6+ — 운영 효율화 (부분 완료, 2026-05-07)**
- ✓ SKU 자동 매핑 추천
- ✓ 운영 대시보드 위젯
- 남은 작업: 재고 sync, 다중·variant 매핑, 임계값 알림, 채널 설정 페이지

### 우선순위 낮음 (UX 개선)

#### 5. 알림(SMS/이메일) 훅
주문 상태 변경 시 고객 통지. Solapi/Twilio 등 외부 SaaS 연동.

#### 6. 송장 사전 등록
PREPARING 단계에서 송장 미리 발급. 현재는 PREPARING_PACKED 진입 시 입력.

#### 7. 반품 처리 전용 뷰
RETURN_* 만 모은 클레임 처리 batch 페이지.

---

## 9. 변경 이력

- **2026-05-08 (8차)**: 부분 반품/환불 (OrderItem 단위) + SKU 다중 매핑 (1:N) — 도메인 큰 두 작업.
  - **부분 반품**: `OrderItem.returnedQty/refundedAmount` 필드 신규. `refund` 액션 `body.partialItems`(orderItemId, returnQty 배열) 받으면 부분 처리. LotConsumption 부분 복원 알고리즘(createdAt DESC, 가장 최근 소진 lot 부터). 모두 fully returned 면 `RETURNED`, 일부면 `COMPLETED` 복귀 + paymentStatus `PARTIAL_REFUND`. 외상은 ledger ADJUSTMENT 부분 차감. UI: RefundDialog 에서 [전체 / 부분] 토글 + 항목별 잔여 수량 입력. 주문 항목 카드에 누적 반품 수량 + 환불 금액 표시.
  - **다중 매핑**: `ChannelProductMapping.productId nullable` + 신규 `ChannelProductMappingComponent` (productId+quantity). 한 채널 SKU 가 ERP 상품 N개로 풀어짐. import 시 `resolveMappingResult` 헬퍼로 단일/다중 통합 (components 배열). 단가는 첫 component 가 raw 값 받고 나머지는 quantity 만 (단순화). UI: AddMappingDialog 에 [단일 / 다중] 토글 + 다중 모드는 ProductCombobox + 수량 입력 여러 개. list 에 "다중 ×N" 배지 + 각 component 세로 나열. 재고 sync 는 단일 매핑만 push (다중은 component min 알고리즘 후속).
- **2026-05-07 (7차)**: 검수 반려 분기(reject_inspection — RETURN_COLLECTED → COMPLETED, 재고 복원 X) + 외상 반품 → customer ledger 자동 ADJUSTMENT (SALES_CANCELLED 시 잔액 차감) + Inventory 변동 시 채널에 가용 재고 자동 push (`dispatchPushStock`, autoStockSync config 토글) + 채널 설정 Dialog (polling 빈도/D+1 offset/자동 push toggle/임계값) + 알림 시스템 인터페이스 (`lib/notifications/` Mock 어댑터 + dispatch helper) + 임계값 알림(보류 큐 N건 초과 시 ADMIN 알림) + 배송완료/반품 수락·반려 시 고객 SMS 알림. 부분 처리·다중 매핑은 모델 변경 큰 작업이라 후속 PR 로 분리.
- **2026-05-07 (6차)**: 출고 5단계화 (PENDING/PREPARING/PREPARING_PACKED/SHIPPED/COMPLETED — 출고확정 분리, 취소는 출고대기까지) + 반품/교환 5단계화 (REQUESTED/ACCEPTED/COLLECTED/INSPECTED/COMPLETED — 회수·검수 분리) + paymentStatus 확장 (REFUND_PENDING + SALES_CANCELLED) + claimType 별 라벨 동적 분기 (반품/교환) + jm `accent` 보라 토큰 + 흐름별 색 통일 (출고=파랑, 반품=노랑, 교환=보라).
- **2026-05-07 (5차)**: 외부 채널 자동화 Phase 2-비의존 후속 — SKU 자동 매핑 추천, Outbound hook, Cron 라우트, 운영 대시보드 위젯.
- **2026-05-07 (4차)**: 외부 채널 자동화 Phase 1 — `ChannelAdapter` 인터페이스, `MockChannelAdapter`, import 변환 로직, SKU 매핑/보류 큐 모델 + UI.
- **2026-05-07 (3차)**: OrderItem 편집 UI(PENDING 한정) + customerPayment FIFO 자동 매칭.
- **2026-05-07 (2차)**: 클레임 분기(claimType/claimReason) + 교환 자동화(새 주문 자동 생성) + 마진 리포트 정합성 + 차액 자동 계산 + 운임 책임 안내.
- **2026-05-07 (1차)**: 3축 분리(출고/결제/반품) + 반품 흐름 세분화(RETURN_REQUESTED/RETURN_ACCEPTED) + 시각 위계 4단계 + 결제 컬럼 분리.
- **이전**: 단일 OrderStatus 축, paymentMethod 만 존재, 반품 = `[반품]` 1단계 일괄.
