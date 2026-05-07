# 주문(Order) 시스템 설계

> 2026-05-07 재설계. 출고·결제·반품 3축 분리 + 클레임 분기 + 교환 자동화.
>
> 코드 진입점: [src/app/(dashboard)/orders/](../src/app/(dashboard)/orders/) · [src/app/api/orders/](../src/app/api/orders/) · [prisma/schema.prisma](../prisma/schema.prisma) (`Order` 모델)

---

## 1. 도메인 모델 — 3개 직교 축

기존엔 `OrderStatus` 한 축에 출고·결제·반품이 섞여 표현이 부족했음. 다음 **3축으로 분리**해 직교적으로 추적:

### 축 1. 출고 (`OrderStatus`)

```
PENDING → PREPARING → SHIPPED → COMPLETED
                                     │
                                     ├─→ CANCELLED  (PENDING/PREPARING 에서)
                                     │
                                     └─→ RETURN_REQUESTED → RETURN_ACCEPTED → RETURNED
                                                          ↓                 → EXCHANGED
                                                       COMPLETED (반려·자진취소)
```

| 상태 | 의미 | 재고 |
|---|---|---|
| `PENDING` | 접수 대기 — 외부 채널 import / B2B 미확정 | 미차감 |
| `PREPARING` | 준비 중 — 재고 차감됨 | **차감** |
| `SHIPPED` | 발송 — 택배 인계 / 배달 출발 | 차감 |
| `COMPLETED` | 인도 종결 | 차감 |
| `RETURN_REQUESTED` | 반품 요청 — 매장 결정 대기 | 차감 (아직 복원 X) |
| `RETURN_ACCEPTED` | 반품 수락 — 회수 대기 | 차감 (아직 복원 X) |
| `CANCELLED` | 취소 종결 | 복원 (PREPARING이상이었으면) |
| `RETURNED` | 반품 종결 (환불) | **복원** |
| `EXCHANGED` | 교환 종결 | **복원** + 새 주문 자동 생성 |

### 축 2. 결제 (`paymentStatus`)

`UNPAID` / `PAID` / `PARTIAL_REFUND` / `REFUNDED`

출고 축과 **직교** — `PREPARING + UNPAID` (외상 출고 준비), `RETURNED + REFUNDED` 등 자유 조합.

자동 산출:
- 주문 생성 시 `paymentMethod=UNPAID` 또는 `null` → `UNPAID`, 그 외 → `PAID`
- `cancel` / `return` 시 `PAID` 였으면 → `REFUNDED`. `UNPAID` 였으면 그대로 (받을 돈 없음)
- `exchange` 시 paymentStatus 그대로 유지 (차액은 새 주문에서 정산)
- `PARTIAL_REFUND` 는 enum만 정의, 부분 반품 도입 시 사용

### 축 3. 클레임 (`claimType` + `claimReason`)

반품·교환 요청 단계부터 **손님 의도 + 책임 사유** 명시.

**`OrderClaimType`** (3가지) — 손님이 원하는 결과:

| 값 | 의미 | 회수 후 처리 |
|---|---|---|
| `REFUND` | 환불 | 재고 복원 + 환불 (RETURNED) |
| `EXCHANGE_SAME` | 같은 상품 재발송 | **새 주문 자동 생성** (항목 복제, 매출 0) |
| `EXCHANGE_DIFFERENT` | 다른 상품 교체 | **새 주문 자동 생성** (빈 항목, 사용자 편집) |

**`OrderClaimReason`** (6가지) — 책임 소재:

| 값 | 책임 (`CLAIM_REASON_LIABILITY`) |
|---|---|
| `DEFECTIVE` (불량/하자) | shop |
| `DAMAGED_IN_TRANSIT` (배송 중 파손) | shop |
| `WRONG_ITEM` (오배송) | shop |
| `CHANGE_MIND` (단순 변심) | customer |
| `SIZE_COLOR` (사이즈/색상 변경) | shared |
| `OTHER` (기타) | shared |

책임 매핑은 [src/app/(dashboard)/orders/_types.ts](../src/app/(dashboard)/orders/_types.ts) 의 `CLAIM_REASON_LIABILITY` + `liabilityShippingNote()` 헬퍼로 운임 안내 자동화.

---

## 2. API 액션 매핑

`PUT /api/orders/[id]` — body `{ action, ...payload }`

| action | 전이 | 부수효과 |
|---|---|---|
| `prepare` | PENDING → PREPARING | 재고 차감 (FIFO + LotConsumption) + cost snapshot |
| `ship` | PREPARING → SHIPPED | trackingCarrier/Number 함께 저장 가능 |
| `complete` | SHIPPED → COMPLETED | 상태만 |
| `cancel` | PENDING/PREPARING → CANCELLED | 재고 복원 (PREPARING 일 때) + paymentStatus PAID→REFUNDED |
| `request_return` | COMPLETED → RETURN_REQUESTED | `claimType` (필수, default REFUND), `claimReason`, `returnReason` 저장 |
| `accept_return` | RETURN_REQUESTED → RETURN_ACCEPTED | 매장이 claimType 변경 가능 |
| `reject_return` | RETURN_REQUESTED → COMPLETED | `returnRejectedAt` 기록, claim 정보 보존 |
| `cancel_return_request` | RETURN_REQUESTED → COMPLETED | 손님 자진 취소 — claim 정보 클리어 |
| `return` | COMPLETED / RETURN_REQUESTED / RETURN_ACCEPTED → RETURNED | **재고 복원** + paymentStatus PAID→REFUNDED |
| `exchange` | RETURN_ACCEPTED → EXCHANGED | **재고 복원** + **새 주문 자동 생성** + 양방향 link, paymentStatus 유지 |

### 즉시 반품 (단축 경로)
COMPLETED 에서 `return` 직접 호출 — 매장에서 손님이 즉석 처리. claimType=REFUND 자동.

---

## 3. 교환 자동화 — 새 주문 생성 메커니즘

`exchange` 액션 호출 시 트랜잭션 내에서 새 Order 자동 create.

**주문번호**: 원본 + `-EX` 접미사 (예: `ORD250507-AB12-EX`) — 한눈에 식별.

### EXCHANGE_SAME (같은 상품)
- 항목 = 원본 항목 그대로 복제
- `totalAmount` = 원본과 동일
- `paymentStatus = PAID` (이미 결제됨, 추가 결제 없음)
- `paymentMethod` = 원본과 동일
- **마진 리포트에서 자동 제외** (매출 중복 방지) — `exchangedFromOrders: { none: {} }` 필터

### EXCHANGE_DIFFERENT (다른 상품)
- 항목 = **빈 배열**
- `totalAmount` = 0, `paymentStatus = UNPAID`
- 사용자가 새 항목 편집 후 차액 결제 처리

### 양방향 link (스키마)
```prisma
exchangeOrderId      String?  @unique   // 원본 → 새 주문 (정방향)
exchangeOrder        Order?   @relation("OrderExchange", ...)
exchangedFromOrders  Order[]  @relation("OrderExchange")  // reverse
```

상세 시트는 양쪽에 link 노출:
- 원본 시트: "교환 새 주문 → ORD…-EX"
- 새 주문 시트: "← 교환 원본 ORD…"

### 차액 자동 계산 (`ExchangeReplacementCard`)
새 주문 상세 시트의 자동 노출 카드. `exchangedFromOrders` 가 있을 때:
- 원본 totalAmount, 현재 totalAmount, 차액 자동 계산
- 차액 양수: warning "손님 추가 결제 필요 +₩XX"
- 차액 음수: warning "매장 환불 필요 ₩XX"
- 0 또는 EXCHANGE_SAME: muted "차액 없음"

---

## 4. UI 시각 위계

### 배지 4단계 위계 (한 줄 동시 노출 시 색 충돌 방지)

| 순위 | 배지 | 시각 | 크기 |
|---|---|---|---|
| 1순위 | 출고 상태 (StatusBadge) | 색 채워짐 + 의미 아이콘 (진행 중) / outline (종결) | md |
| 2순위 | 결제 상태 (PaymentStatusBadge) | outline + 색 dot | sm |
| 3순위 | 출고 방식 (FulfillmentBadge) | default(회색) + 아이콘 | sm |
| 3순위 | 채널 (ChannelBadge) | 오프라인=default / 외부=info(파랑) + 아이콘 | sm |

상세 매핑은 [_parts.tsx](../src/app/(dashboard)/orders/_parts.tsx) 의 `STATUS_VISUAL` / `PAYMENT_DOT` 참조.

### 워크보드 컬럼

```
주문번호 | 상태 | 출고 | 채널 | 고객/항목 | 출고예정 | 합계 | 결제 | 액션
```

- **상태** 셀: StatusBadge 단독
- **결제** 셀: PaymentStatusBadge `showPaid=true` — 모든 행에 dot 노출 (한눈 스캔)
- **합계** 셀: 단순 금액. REFUNDED만 line-through

### 상태 흐름 가이드 (`StatusFlowGuide`)
워크보드 상단에 출고·반품 두 줄로 시각화:
```
출고: 접수 → 준비 → 발송 → 완료
반품: 완료 → 반품요청 → 회수대기 → 환불/교환  · 즉시 반품(1단계) 또는 교환 분기
```

### 액션 footer (상세 시트)

| 현재 상태 | 노출 버튼 |
|---|---|
| PENDING | [취소] [준비 시작] |
| PREPARING | [취소] [발송] |
| SHIPPED | [완료] |
| COMPLETED | [즉시 반품] [반품 요청] |
| RETURN_REQUESTED | [요청 취소] [반려] [수락] |
| RETURN_ACCEPTED | [교환 처리] [환불 처리] |
| CANCELLED/RETURNED/EXCHANGED | "종결된 주문입니다" |

### Dialog 분기

**ClaimRequestDialog** ([반품 요청] 클릭 시):
- 처리 종류 (REFUND / EXCHANGE_SAME / EXCHANGE_DIFFERENT) 선택
- 사유 chip 6개
- 자유 메모 textarea

**ExchangeDialog** ([교환 처리] 클릭 시):
- 책임 안내 자동 표시 (claimReason 기반)
- SAME / DIFFERENT 선택 카드
- 새 주문 prefill 분기 결정

**ShipDialog** ([발송] 클릭 시):
- trackingCarrier, trackingNumber 입력

---

## 5. 운영 시나리오

### A. 정상 출고
```
POS 결제 (DELIVERY) → PREPARING (즉시 재고 차감)
ERP 워크보드 → [발송] → ShipDialog (송장 입력) → SHIPPED
                     → [완료] → COMPLETED
```

### B. 같은 상품 교환 (불량)
```
1. 손님 "불량이라 같은 거로 교환"
2. ClaimRequestDialog → claimType=EXCHANGE_SAME, reason=DEFECTIVE
3. RETURN_REQUESTED → [수락] → RETURN_ACCEPTED
4. 회수 도착 → [교환 처리] → ExchangeDialog
   "불량/하자 · 운임 매장 부담" 안내 자동 노출
   → EXCHANGE_SAME 확정 → EXCHANGED
5. 새 주문 ORD…-EX 자동 생성 (PENDING, 항목 복제, paymentStatus=PAID)
6. 새 주문 워크보드 진입 → 매장이 발송 진행
7. 새 주문 카드: "교환 발송 — 매출 미인식" 표시
8. 마진 리포트에서 자동 제외
```

### C. 다른 상품 교환 (변심)
```
1. 손님 "다른 색으로 바꿔주세요"
2. ClaimRequestDialog → EXCHANGE_DIFFERENT, CHANGE_MIND
3. 수락 → 회수
4. [교환 처리] → "단순 변심 · 운임 손님 부담" 안내
   → DIFFERENT 확정 → EXCHANGED
5. 새 주문 (PENDING, 빈 항목, paymentStatus=UNPAID, totalAmount=0)
6. 사용자가 새 항목 등록 → totalAmount 갱신
7. ExchangeReplacementCard "차액 +₩30,000 ⚠️ 손님 추가 결제 필요"
8. 손님 차액 결제 후 paymentStatus → PAID, 발송 흐름
```

### D. 외상 (UNPAID) 결제 후 환불
```
B2B 주문 paymentMethod=UNPAID → paymentStatus=UNPAID + customerLedger SALE 잔액
출고 진행 → COMPLETED
손님 입금 후 customerPayment 처리 → paymentStatus=PAID 수동 갱신 (현재 미자동)
or 반품 시 paymentStatus 그대로 UNPAID (받을 돈 없음, 환불 X)
```

---

## 6. 데이터 모델 (Order 신규 필드)

```prisma
model Order {
  // 기존
  status              OrderStatus         @default(PENDING)  // RETURN_REQUESTED/RETURN_ACCEPTED/EXCHANGED 추가
  paymentMethod       OrderPaymentMethod? @map("payment_method")

  // 결제 축
  paymentStatus       OrderPaymentStatus  @default(UNPAID)

  // 반품 흐름 timestamp (운영 로그)
  returnRequestedAt   DateTime?
  returnAcceptedAt    DateTime?
  returnRejectedAt    DateTime?
  exchangedAt         DateTime?

  // 클레임 분기
  claimType           OrderClaimType?     // REFUND / EXCHANGE_SAME / EXCHANGE_DIFFERENT
  claimReason         OrderClaimReason?   // DEFECTIVE / DAMAGED_IN_TRANSIT / WRONG_ITEM / CHANGE_MIND / SIZE_COLOR / OTHER
  returnReason        String?             // 자유 메모

  // 교환 양방향 link (self-relation)
  exchangeOrderId     String?  @unique
  exchangeOrder       Order?   @relation("OrderExchange", ...)
  exchangedFromOrders Order[]  @relation("OrderExchange")
}
```

---

## 7. 마진 리포트 정합성

`exchangedFromOrders: { none: {} }` 필터로 교환 발송 새 주문은 자동 제외 ([api/reports/margin/route.ts:99-102](../src/app/api/reports/margin/route.ts#L99-L102)).

채널/상품/일별 집계, 영업이익 모두 자동 정상화 — 별도 boolean 플래그 불필요.

---

## 8. 한계와 후속 작업

### 우선순위 높음 (도메인 정합성)

#### 1. 차액 결제 자동 청구·환불 미구현
- 현재 EXCHANGE_DIFFERENT 차액은 표시만 (warning 메시지). 실제 결제·환불은 매장이 직접 처리.
- 항목 편집 UI 와 차액 자동 계산은 도입됨 — 다음 단계는 알림 훅 + 자동 결제·환불 라인.
- 구현 포인트:
  - 차액 양수 시: 손님에게 결제 안내 발송 (SMS/이메일 훅 필요 — 현재 알림 시스템 자체 부재)
  - 차액 음수 시: customerPayment 자동 환불 라인 생성
  - 차액 결제 완료 후 paymentStatus 자동 갱신은 customerPayment 의 FIFO 매칭으로 일부 작동

#### 2. 운임 자동 청구
- `CLAIM_REASON_LIABILITY` 매핑은 안내만. 실제 운임 라인 자동 추가 X.
- 매장 책임 사유면 새 주문 shippingFee=0 (매장 부담), 손님 책임이면 정책 운임 자동 청구 등 자동화 가능.
- 매장 정책 다양해 자동 결정은 위험 — 매장별 정책 설정 페이지 선결.

#### 3. 부분 결제 (PARTIAL_REFUND) 자동 처리
- enum 정의됨, 액션 미구현
- 부분 반품 도입 시 사용 — 일부 항목만 환불, paymentStatus = PARTIAL_REFUND
- customer-payment FIFO 매칭은 fully-paid 만 처리 — 부분 매칭은 customer 잔액에만 반영

### 우선순위 중간 (확장 기능)

#### 4. 외부 채널 자동화 — 단계별 로드맵

**Phase 1 — 도메인 layer (완료, 2026-05-07)**
- 어댑터 인터페이스 (`ChannelAdapter`), import 변환 로직, SKU 매핑 모델·UI, 보류 큐, Mock 어댑터
- `(channelId, channelOrderNo)` unique 인덱스로 중복 방지
- `/channels/imports` 페이지 (Import 트리거·보류 큐·SKU 매핑)

**Phase 2 — 실 채널 어댑터 (가입·API 키 후)**
- `lib/channels/coupang.ts`, `naver.ts` 등 채널별 어댑터 구현
- OAuth 인증·토큰 갱신
- 채널 API 응답 → `RawChannelOrder` 매핑 (실제 응답 schema 와 normalize)
- `lib/channels/registry.ts` 에 등록만 추가하면 즉시 활성화 (UI·도메인 변경 X)
- rate limit 대응

**Phase 3 — 자동 트리거 (사용자가 버튼 안 눌러도 자동)**
- **Polling cron** — `/api/cron/channel-poll` 라우트 + Vercel cron 또는 Supabase pg_cron 등록. 5~15분 간격으로 활성 어댑터의 fetchNewOrders 자동 호출
- **Webhook 진입** — `/api/webhooks/channel/[provider]` 라우트. signature 검증 (각 채널 별 방식). polling 과 동시 운영 가능 (같은 import 변환 거치니 중복 자동 처리)
- 실패 시 retry 큐 (PendingChannelOrder.status = VALIDATION_FAILED 활용)

**Phase 4 — Outbound 동기화 (ERP → 채널 자동 통보)**
- ERP `[발송]` 액션 후 `adapter.pushTrackingNumber()` 자동 호출 → 채널에 송장 등록 (사용자가 채널 콘솔 별도 입력 불필요)
- ERP `[수락]/[반려]` 후 `adapter.acceptReturn()/rejectReturn()` 자동 호출
- 실패 시 retry — 큐 모델 신설 또는 audit log 기반 재시도

**Phase 5 — 채널 → ERP 역방향 자동화 (Inbound)**
- 채널에서 반품 요청 들어오면 webhook 수신 → ERP `Order.status = RETURN_REQUESTED` 자동 전이 + claimType/Reason 채널 데이터에서 매핑
- 채널 정산 데이터 받으면 paymentStatus 자동 PAID 전이 + 채널 수수료 정산 (customerPayment FIFO 매칭과 별개 — 채널 정산용 별도 테이블 도입 가능)
- 채널 취소 요청 자동 import → ERP CANCELLED 전이

**Phase 6+ — 운영 효율화**
- **재고 sync** — Inventory 변동 시 채널에 가용 재고 push (품절 표시 자동). 채널별 단가도 sync
- **SKU 자동 매핑 추천** — 보류 큐 항목에 동일 SKU 코드·상품명 유사도 기반 추천 매핑 표시 → 1클릭 매핑
- **다중·variant 매핑** — 한 채널 SKU 가 ERP 세트 상품 또는 variant 로 매핑 (현재는 1:1만)
- **운영 대시보드** — import 실패/보류 누적/매핑 누락 SKU 통계. 임계값 초과 시 매장 알림
- **채널 설정 페이지** — credentials, 정책(D+1, 운임), polling 빈도 등 매장이 직접 관리

#### 5. 부분 출고 / 부분 취소 / 부분 반품
- 현재 OrderItem 단위 차감/복원 미지원 (전체 또는 취소만)
- 5개 중 2개만 먼저 발송, 3개만 반품 같은 케이스 미지원
- `OrderItem.shippedQty`, `returnedQty` 필드 추가 + 각 액션이 item 단위 차감/복원

#### 6. 반품 회수 단계 세분화
- 현재 RETURN_ACCEPTED 한 단계가 "회수 대기" + "회수 중" + "회수 완료"를 모두 포함
- 택배 회수 라벨 발급, 회수 추적이 매장 운영에 필요해지면 별도 상태 추가 검토

### 우선순위 낮음 (UX 개선)

#### 7. 알림(SMS/이메일) 훅
- 주문 상태 변경 시 고객 통지 (출고 알림, 반품 수락/반려, 차액 결제 안내 등)
- 알림 시스템 자체가 ERP에 없음 — Solapi/Twilio 등 외부 SaaS 연동 필요

#### 8. 송장 사전 등록
- 현재는 `[발송]` 누를 때만 송장 입력
- PREPARING 단계에서 송장 미리 발급해두는 흐름 (배송 라벨 일괄 출력 등) 미지원

#### 9. 반품 처리 전용 뷰
- 현재 워크보드는 PENDING/PREPARING/SHIPPED 출고 흐름만
- RETURN_REQUESTED/RETURN_ACCEPTED 만 모은 "반품 처리" 뷰 도입 권장 (매장이 클레임 처리 batch)

---

## 9. 변경 이력

- **2026-05-07 (4차)**: 외부 채널 자동화 Phase 1 — `ChannelAdapter` 인터페이스, `MockChannelAdapter` (가입 전 검증용), import 변환 로직(SKU 매핑 lookup + 보류 큐 격리 + 중복 방지), `ChannelProductMapping`/`PendingChannelOrder` 모델, `Order(channelId, channelOrderNo)` unique 인덱스, `/channels/imports` 통합 페이지 (Import 트리거·보류 큐·SKU 매핑 탭). Phase 2 (실 채널 어댑터) 는 가입 후.
- **2026-05-07 (3차)**: OrderItem 편집 UI(PENDING 한정 + 금액 자동 재계산) + customerPayment FIFO 자동 매칭(외상→입금 시 paymentStatus PAID 자동 전이) + tsconfig 빌드 정합성 보정 (prisma/seed·scripts exclude).
- **2026-05-07 (2차)**: 클레임 분기(claimType/claimReason) + 교환 자동화(새 주문 자동 생성, 양방향 link) + 마진 리포트 정합성(교환 발송 자동 제외) + 차액 자동 계산 + 운임 책임 안내.
- **2026-05-07 (1차)**: 3축 분리(출고/결제/반품) + 반품 흐름 세분화(RETURN_REQUESTED/RETURN_ACCEPTED) + 시각 위계 4단계 + 결제 컬럼 분리.
- **이전**: 단일 OrderStatus 축, paymentMethod 만 존재, 반품 = `[반품]` 1단계 일괄.
