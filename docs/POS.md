# POS 시스템 설계

> 2026-05 정리. v2 가 기본 `/pos` 로 승격됨 (v1 폐기, 4c5235f). 이 문서가 현재 운영의 단일 출처.
>
> 코드 진입점: [src/app/(pos)/](../src/app/(pos)/) · [src/app/api/pos/](../src/app/api/pos/) · [src/components/pos/](../src/components/pos/) · [src/jm/](../src/jm/) (디자인 시스템)

---

## 1. 라우트 맵

```
/pos                          손님 그리드 — 진입점, 활성 카트 세션 카드
/pos/customer/[sid]           손님 작업 페이지 (상품/수리/임대 모드 탭바)
/pos/customer-profile/[id]    등록 고객 프로필 (이력·잔액)
/pos/repairs                  수리관리 — 6섹션 (픽업대기 / 견적송부 / 수리중 / 진단중 / 진단대기 / 최근완료)
/pos/repairs/[id]             수리 티켓 상세 (RepairDetail) — 손님 페이지 안에서도 같은 컴포넌트 재사용
/pos/rentals                  임대관리 — 4섹션 (현재임대 / 오늘픽업예약 / 임대가능 / 전체)
/pos/parked                   저장된 상담 — 장바구니 저장된 PosSession 목록
```

API:
```
GET  /api/pos/sessions                       활성 세션 (deletedAt=null AND parkedAt=null)
POST /api/pos/sessions                       sync (last-write-wins + soft delete + parked 거부)
POST /api/pos/sessions/resurrect             손님 카드 부활 ({customerId} 또는 {posSessionId})
GET  /api/pos/sessions/parked                저장된 상담 목록 (parkedAt != null)
DELETE /api/pos/sessions/parked?id=          저장된 상담 영구 삭제
POST /api/pos/sessions/[sid]/park            장바구니 저장 (parkedAt = now)
POST /api/pos/sessions/[sid]/unpark          부활 + 가격 갱신 (parkedAt = null + 라인 sellingPrice 재계산)
POST /api/pos/sessions/[sid]/link-customer   미등록 → 등록 고객 연결 (RepairTicket.customerId 도 일괄)
POST /api/pos/checkout                       결제 — Order 생성 + 재고 차감 + 영수증 발번
POST /api/serial-items/issue                 시리얼 라벨 발번
```

---

## 2. PosSession 상태 머신

`PosSession` 은 손님 한 명의 카트 컨텍스트. 디바이스간 sync (`updatedAt` last-write-wins).

```
                 ┌──────────────────────────────────────────────┐
                 │                                              │
                 │   활성 (그리드 표시)                          │
   addSession ───┤   deletedAt=null, parkedAt=null              │
                 │                                              │
                 └─┬────────────────┬─────────────┬─────────────┘
                   │                │             │
              결제 │            저장 │       그리드│ X
               ↓ │            (park) │       (discard)
        Order 생성│                ↓ │             ↓
        후 사라짐 │   저장된 상담   │      삭제 (soft)
                  │   parkedAt=now │     deletedAt=now
                  │                │
                  │           unpark│
                  │       (가격 갱신)│
                  └─────────────────┘
```

### 3가지 종결 경로

| 경로 | 트리거 | 효과 | 복구 |
|---|---|---|---|
| **결제** | `/api/pos/checkout` | Order 생성 + 재고 차감 + PosSession 자체는 sync 에서 사라짐 (사장은 새 세션 시작) | Order 에서 환불·취소 |
| **장바구니 저장** | 카트 시트 [장바구니저장] / 그리드 X 다이얼로그 | `parkedAt=now`. 그리드에서 사라지지만 `/pos/parked` 에 보존 | unpark API 로 가격 갱신 후 부활 |
| **그냥 닫기** | 그리드 X 다이얼로그 [그냥 닫기] | `deletedAt=now`. 라인 휘발 | 없음 |

### 손님 그리드 X 정책 (B안)

[/pos/page.tsx](../src/app/(pos)/pos/page.tsx) 에서 분기:

| 상황 | 동작 |
|---|---|
| 카트 비어있음 + (등록 고객 OR 수리 0건) | 즉시 X (removeSession) |
| 카트 비어있음 + 미등록 + 수리 ≥ 1건 | **X 막음** (수리 추적 끊김 방지 — 고객 등록 또는 수리관리에서 부활) |
| 카트 ≥ 1건 | `CloseSessionSheet` 다이얼로그: [장바구니로 저장] / [그냥 닫기] / [취소] |

진행중 수리는 `customerId` 또는 `posSessionId` 매칭으로 `/pos/repairs` 에서 항상 부활 가능.

---

## 3. 견적서 vs 장바구니 저장 — 의도 분리

두 개념이 섞이지 않게 분리한 게 2026-05 PR의 핵심 결정.

| 측면 | **견적서** (`Quotation`) | **장바구니 저장** (`PosSession.parkedAt`) |
|---|---|---|
| 본질 | 정식 문서, 가격 약속 (1개월 유효) | 매장 내부 메모 |
| 가격 | **락** (그 시점 unitPrice/listPrice 스냅샷) | **부활 시 현재 sellingPrice 로 재계산** |
| 손님 전달 | 인쇄 / PDF / 손님 이메일 | 안 나감 |
| 식별자 | `QUO[YYMMDD]-[NNNN]` | PosSession ID (UUID) |
| 부활 대상 | `convert` API → Order/Statement/PurchaseOrder | unpark API → 새 세션 합류 |
| 라인 종류 | 자유 입력 라인 허용 | productId 있는 product 라인만 가격 갱신, 자유 입력은 그대로 |
| UI 진입 | 카트 시트의 `[견적서]` 버튼 | 카트 시트의 `[장바구니저장]` / 메뉴 → `저장된 상담` |

**왜 분리했나** — 견적서로만 커버하면:
1. 1~2개월 뒤 손님이 와도 옛날 가격이 박혀있어 "그 가격으로 안 돼요" 가 어색
2. "정식 약속한 견적" vs "그냥 상담 메모" 가 한 모델에 섞여 매장 측에서 가려내기 어려움

견적서는 가격 commitment, 장바구니는 매장 메모 — 의도가 다른 두 개념을 별도 모델로.

---

## 4. 카트 시트 메뉴 (5버튼)

[_cart-sheet.tsx](../src/app/(pos)/pos/_cart-sheet.tsx) — 카트 합계 영역 아래 5x1 액션 그리드:

| 버튼 | 동작 | 활성 조건 |
|---|---|---|
| **할인** | 정액/% 혼용 입력 (DiscountInputDialog) | 카트 ≥ 1건 |
| **배송비** | TAXABLE 금액 입력 (PriceInputDialog) | 카트 ≥ 1건 |
| **시리얼출력** | `/api/serial-items/issue` 발번 + 라벨 미리보기 모달 | trackable 상품 라인 있음 |
| **장바구니저장** | `parkedAt=now` 후 `/pos` 이동 | 카트 ≥ 1건 |
| **견적서** | 신규 발행 (Quotation 생성) 또는 재인쇄 (fingerprint 변화 없음 시) | 카트 ≥ 1건 + 등록 고객 |

견적서는 미등록 손님에선 비활성 (Quotation 모델이 customerId 필수). 장바구니 저장은 미등록도 가능 (다만 `/pos/parked` 에서 "미등록 손님 #abc1234" 로 표기되어 식별이 약함).

---

## 5. 수리 도메인

### 상태 전이

```
RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP
            (진단중)     (견적     (손님       (작업중)    (픽업    (인계)
                         송부)    승인)                  대기)

         ↓ 어디서든
      CANCELLED
```

`type`:
- **ON_SITE** (즉시수리) — 손님 매장 대기, 보통 RECEIVED → REPAIRING 직진
- **DROP_OFF** (맡김수리) — 정상 흐름. QUOTED 단계에서 `approvalToken` 으로 손님이 [/repair/approve/[token]](../src/app/repair/approve/[token]/page.tsx) 에서 원격 승인

### 수리관리 페이지 섹션 (우선순위 순)

[/pos/repairs/page.tsx](../src/app/(pos)/pos/repairs/page.tsx) — 매장 사장의 매일 처리 우선순위:

| # | 섹션 | 상태 | 색 | 매장 액션 |
|---|---|---|---|---|
| 1 | 픽업 대기 | READY | emerald | 손님 오면 인계·결제 |
| 2 | 견적 송부 | QUOTED | amber | 손님 답변 follow-up |
| 3 | 수리중 | APPROVED + REPAIRING | blue | 작업 진행 |
| 4 | 진단중 | DIAGNOSING | amber | 직원 진단 |
| 5 | 진단 대기 | RECEIVED | zinc | 새로 접수, 아직 안 봄 |
| 6 | 최근 완료 | PICKED_UP (7일) | zinc | 이력 확인 |

상단 칩으로 단일 섹션 필터 가능 (`전체 / 픽업대기 / ...`). 칩 활성 시 섹션 헤더는 숨김 (중복 제거).

CANCELLED 는 노출 안 함.

### 행 클릭 → 액션 시트

[`_action-sheet.tsx`](../src/app/(pos)/pos/repairs/_action-sheet.tsx):
- **이 손님 카드 열기** — `/api/pos/sessions/resurrect` 호출 → 그리드 합류 → `/pos/customer/[sid]` 이동
- **수리 상세** — `/pos/repairs/[id]` (RepairDetail)
- **결제로 이동** (READY 일 때만) — 손님 카드 부활 + 카트로 (현재는 카드 부활까지, 카트 라인 자동 추가는 후속작업)

### 부활 분기

| 케이스 | 부활 방식 |
|---|---|
| 등록 고객 + 활성 세션 있음 | 그 세션 그대로 (resurrect API 가 반환) |
| 등록 고객 + 활성 세션 없음 | 새 PosSession 생성 + customerId 연결 |
| 미등록 손님 + 원본 세션 살아있음 | 그 세션 활성화 |
| 미등록 손님 + 원본 세션 soft-deleted | `deletedAt = null` 풀고 같은 sessionId 유지 → RepairTicket.posSessionId 매칭 보존 |

---

## 6. 임대 도메인

### 상태 전이

```
RESERVED → ACTIVE → RETURNED
              ↓
            OVERDUE  (endDate 지나면 GET 시점에 자동 전환 via refreshOverdue)
              ↓
            RETURNED (실제 반납 시)

      ↓ 어디서든
   CANCELLED
```

자산 상태 (`RentalAsset.status`):
- AVAILABLE (가용) / RENTED (임대중) / MAINTENANCE (정비) / RETIRED (폐기)

### 임대관리 페이지 섹션

[/pos/rentals/page.tsx](../src/app/(pos)/pos/rentals/page.tsx):

| # | 섹션 | 데이터 | 색 |
|---|---|---|---|
| 1 | 현재 임대 | ACTIVE + OVERDUE | rose |
| 2 | 오늘 픽업 예약 | RESERVED with `startDate=today` | amber |
| 3 | 임대 가능 | RentalAsset.status=AVAILABLE | emerald |

상단 칩으로 단일 섹션 필터.

### 임대 가능 카드의 예약 표시

자산이 AVAILABLE 이어도 미래 RESERVED / 진행 ACTIVE / OVERDUE 가 있을 수 있음. 카드 하단에 그 자산의 모든 점유(ACTIVE+OVERDUE+RESERVED) 를 시작일순으로 노출 — 클릭 안 해도 일정 한눈에. (액션시트 안의 "이미 예약됨" 표시와 동일 데이터 소스).

### 자산 썸네일

`RentalAsset.product.imageUrl` 펼쳐 카드/행에 표시. 없으면 자산명 첫 글자 아바타.

---

## 7. 디자인 시스템 — jm

POS 모든 화면은 **`Jm*` primitive** 와 `var(--jm-*)` 토큰만 사용. shadcn `@/components/ui/*` import 금지.

핵심 룰 ([src/jm/DESIGN.md](../src/jm/DESIGN.md) 참고):
- 컴포넌트 prefix: `JmButton`, `JmCard`, `JmDrawer`, `JmCombobox`, ...
- 토큰: `--jm-bg`, `--jm-surface`, `--jm-border`, `--jm-action`, `--jm-success-solid` 등 (zinc-* / hex 하드코딩 금지)
- 테마: `<JmScope theme="light|dark|auto">` 로 cascade. POS 는 `PosThemeWrapper` 가 localStorage 영구 저장

상태 점·칩 색상은 jm semantic 토큰:
- 성공 (READY, 임대 가능): `--jm-success-solid`
- 경고 (QUOTED, 예약): `--jm-warning-solid`
- 위험 (OVERDUE, 연체): `--jm-danger-solid`
- 정보 (REPAIRING): `--jm-info-solid` (또는 직접 blue)
- 중립 (PICKED_UP, 종결): muted

---

## 8. 운영 흐름 — 실제 시나리오

### 시나리오 A — 신규 손님이 매장 방문, 상품 결제

1. 사장이 `/pos` 의 [+ 새 손님] 누름 → 미등록 PosSession 생성
2. 자동으로 `/pos/customer/[sid]` 이동
3. 상품 모드에서 상품 검색·추가 → 카트
4. 카트 시트에서 [할인]/[배송비] 조정
5. [결제] 누름 → PaymentSheet → 영수증 발행, PosSession 종결, 그리드로 복귀

### 시나리오 B — 등록 고객의 수리 픽업

1. 손님 매장 방문 → `/pos/repairs` 진입
2. **픽업 대기** 섹션에서 그 손님 행 탭 → 액션시트
3. [결제로 이동] 또는 [이 손님 카드 열기] → 손님 카드 합류
4. 손님 페이지에서 수리 모드 → 픽업 시트로 결제 처리

### 시나리오 C — 상담 후 손님이 그냥 감

1. 사장이 손님과 상품 보면서 카트에 라인 담음
2. 손님이 "조금 더 생각하고 올게요"
3. 카트 시트의 [장바구니저장] → confirm → `parkedAt=now`, 그리드에서 사라짐
4. 1주일 뒤 손님 다시 옴 → 메뉴 [저장된 상담] → 그 손님 행 [가져오기]
5. 가격이 그동안 바뀌었으면 자동 갱신 → 손님 페이지로 이동
6. 결제 또는 견적서 발행

### 시나리오 D — 미등록 손님이 수리만 맡기고 감

1. 사장이 [+ 새 손님] (미등록) → 수리 모드 → 새 수리 접수 (RepairTicket.posSessionId 박힘)
2. 손님 떠남
3. 그리드에서 그 손님 카드 X → 미등록 + 수리 ≥ 1건이라 **X 막힘** + "고객 등록 후 닫기" 안내
4. 사장이 손님 등록(이름/전화) 후 다시 X → 가능
5. 또는 그냥 두면 그리드에 계속 남음 (수리관리에서 추적 가능)
6. 수리 완료 후 손님 픽업 시 `/pos/repairs` 픽업대기 → 손님 카드 부활 → 결제

---

## 9. 후속작업

### 우선순위 높음

- **견적서 → POS 카트 로드** — 발행된 Quotation 을 `/pos` 카트로 다시 불러와 결제하는 흐름. 메뉴/검색에 "견적서 검색" 탭 추가, 선택 시 새 PosSession 생성 + 라인 채움 + customer 자동 연결. 결제 완료 시 Quotation.status = CONVERTED 락
- **결제로 이동 액션 완성** — 수리관리 [결제로 이동] 이 현재는 손님 카드 부활까지만. RepairTicket 의 RepairPart/RepairLabor 합계로 카트 라인 자동 생성 필요

### 우선순위 중간

- **자동 만료 / 노쇼 처리** — 지난 RESERVED 임대 일괄 EXPIRED, 진단 대기 N일 이상 알림. 매장 정책 페이지로 임계값 설정
- **저장된 상담 검색·정렬** — 양 늘어나면 손님 이름/저장일 검색 필요. 현재는 단순 리스트
- **손님 카드 X undo 토스트** — "그냥 닫기" 5초 안에 되돌리기 버튼 (soft delete 라 server-side 복구 가능)
- **외부 채널 자동 import** — 쿠팡/네이버 주문이 워크보드로 합류 (주문 도메인의 후속작업과 연결)

### 우선순위 낮음

- **저장된 상담 → 견적서 일괄 변환** — 1~2달 뒤 가져올 때 한 번에 견적서까지 발행
- **POS_V1_V2_COMPARISON.md historical 정리** — v1 폐기 완료, 이 문서가 단일 출처가 된 시점에서 v1/v2 비교는 archive
- **repair-v2 디렉토리명 정리 잔재** — 컴포넌트명 RepairDetail 등은 정리됨, queryKey/displayName 일관성 점검

---

## 10. 자주 헷갈리는 점

- **PosSession.id 와 sessionId 는 같음** — 클라이언트가 발번한 ID 를 서버가 그대로 받아 PK 로 사용. RepairTicket.posSessionId 가 이걸 참조
- **soft delete vs park 구분** — `deletedAt` 은 휴지통 (UI 부활 안 함), `parkedAt` 은 보관함 (`/pos/parked` 에서 부활 가능). 둘 다 GET 응답에서 제외
- **forceSync** — `useSessions().forceSync()` 는 부활/주차 후 navigation 직전에 호출. 폴링 5초 안 기다리고 즉시 sync
- **RepairTicket 추적 매칭** — 등록 고객은 `customerId`, 미등록은 `posSessionId`. 미등록이 등록 연결 시 [/api/pos/sessions/[sid]/link-customer](../src/app/api/pos/sessions/[sid]/link-customer/route.ts) 가 RepairTicket 도 일괄 매핑
