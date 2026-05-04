# POS v1 / v2 비교

> 마지막 업데이트: 2026-05 (v2 Round 3 + 시리얼 이력 + 미등록 등록/매핑 + 상품 상세 v2 + PriceInputDialog 통일 까지)
>
> v2 가 만족스러우면 v1 폐기 예정 ([13번 결정](#정책-결정)).

## 라우트 구조

| 항목 | v1 | v2 |
|---|---|---|
| 진입점 | `/pos` (사이드바 5개 메뉴) | `/pos/v2` (손님 그리드) |
| 카트 작업 | `/pos/cart/[sessionId]?mode=...` | `/pos/v2/customer/[sid]` |
| 상품 상세 | `/pos/products/[id]` | `/pos/v2/product/[id]` |
| 손님 그리드 | `/pos/all` | `/pos/v2` |
| 고객 페이지 | `/pos/customers`, `/pos/customers/[id]` | ❌ 미구현 |
| 영수증 | ❌ | `/pos-receipt/[id]/print` (80mm) |
| 수리 작업 | `/pos/repairs/[id]` (구버전 RepairWorkView) | `/pos/repair-v2/[id]` (RepairV2Detail, v2 톤) |

## UI / 디자인

| 항목 | v1 | v2 |
|---|---|---|
| 컴포넌트 | shadcn/cmdk/base-ui | shadcn 0개, raw Tailwind + HTML |
| 사이드바 | 88px 좌측 고정 (검색·상품·수리·임대·카트) | v2 진입 시 자동 숨김. 햄버거 메뉴 + 하단 탭바로 대체 |
| 상단 고객 탭 | PosCustomerHeader (세션 탭들) | 숨김 (`isStandalone`) |
| 모드 전환 | 사이드바에서 product/repair/rental 토글 | 손님 작업 페이지의 하단 탭바 (3탭) |
| 가격 표시 | 세전 (`Product.sellingPrice`) | VAT 포함 (`× 1.1`) — POS 사장님이 손님 청구가로 봄 |
| 점선 border | 사용 | 사용 0 (사용자 선호) |
| 뷰포트 높이 | `h-screen` (100vh — iOS Safari 주소창 영역 무시) | `h-dvh` (동적 뷰포트 높이) |
| 다크 모드 | 일부 지원 (CSS 변수 토큰) | ❌ 패스 (사용자 결정) |

## 진입 흐름

| v1 | v2 |
|---|---|
| 사이드바 → 모드 선택 → 카트에 추가 → 결제 | 손님 그리드 → 카드 선택 → 작업 페이지(상품/수리/임대 탭) → 결제 |
| 모드별 화면이 카트 세션 안에 통합 | 손님별로 페이지 분리. 카트 세션이 손님 단위 |

## 손님 / 고객

| 항목 | v1 | v2 |
|---|---|---|
| 미등록 손님 표시 | "고객 1", "고객 2" 단순 카운트 | 8색 팔레트 + #A2K 식별 코드 (sessionId 끝 3자) |
| 미등록 → 등록 | ❌ (어드민 페이지 가야) | 어디서든 "고객 연결" 버튼 → LinkCustomerSheet → 검색·매핑 또는 QuickCustomerSheet 등록 |
| 미등록 → 기존 고객 매핑 | ❌ | 동일 LinkCustomerSheet |
| 고객 디바이스간 공유 | ❌ (localStorage 만) | 서버 sync (`PosSession` 모델 + 5초 polling + debounced push) |

## 카트 / 결제

| 기능 | v1 | v2 |
|---|---|---|
| 라인 추가 | 사이드바 검색 + 상품 클릭 | 그리드 카드 탭 / 검색 시트 / 자주 쓰는 상품 그리드 |
| 라인 단가 변경 | 빠른 입력 | **PriceInputDialog** (공급가액 ↔ 판매가 자동 환산) |
| 라인 수량 변경 | inputs | 큰 +/− 버튼 + input |
| 라인 할인 | 인라인 입력 | (Phase 3 정밀화 예정 — 현재 미구현) |
| 영세율 토글 | CartLineRow 의 toggleZeroRate 버튼 | ❌ 미구현 (v1 누락 항목) |
| 변형 상품(canonical) 선택 | 결제 직전 다이얼로그 | ❌ 미구현 (v1 누락 항목 — 재고 차감 모호) |
| 배송비 입력 | 카트 패널의 다이얼로그 | ❌ 미구현 (v1 누락 항목) |
| 카트 메모 | 결제 시 입력 | ❌ 미구현 (v1 누락 항목) |
| 견적서 발행 | `quotationMutation` (CartCheckoutPanel) | ❌ 미구현 (v1 누락 항목) |
| 거래명세표 발행 | `submitCheckout(action: "statement")` | ❌ 미구현 (v1 누락 항목) |
| 세금계산서 요청 | `taxInvoiceRequested` 토글 | ❌ 미구현 (v1 누락 항목) |
| 라벨 자동 발번 | 결제 시 자동 + 인쇄 모달 | 동일 |
| 영수증 자동 출력 | ❌ | 결제 후 새창 자동 인쇄 (80mm) |
| 외상(UNPAID) 안내 | 일반 결제와 동일 | "○○ 님 미수금에 자동 등록" 명시 |

## 수리

| 항목 | v1 (RepairWorkView) | v2 (RepairV2Detail) |
|---|---|---|
| 디자인 | shadcn 카드/시트 | raw, 다크 합계 카드 강조 |
| 기기 연결 3모드 (시리얼/검색/직접) | ProductSection (있음) | ProductLinkCard (있음, v2 톤) |
| 부속·공임 단가 | 인라인 input | **PriceInputDialog** |
| 진단비 | 인라인 input | **PriceInputDialog** |
| 할인 | 인라인 input (% 또는 정액) | 인라인 input (다이얼로그 부적합 — % 받음) |
| 패키지 빠른 추가 | PackagesSection | PackagesCard (v2 톤) |
| 시리얼 기준 수리 이력 | DeviceRepairHistorySection | **SerialHistoryCard** (사용자 정정 후 추가) |
| 재수리 (parent/revisits) | ❌ (v1 표시 안 함) | RevisitCard (v2 신규) |
| 픽업 결제 | 자체 PickupSheet | 동일 PickupSheet |
| 카트로 보내기 | sendToCart (RepairBottomBar) | (수리 자체 픽업으로 처리 — 카트 통합 미구현) |

## 검색

| 항목 | v1 | v2 |
|---|---|---|
| 글로벌 검색 | SearchDialog (cmdk 기반) | GlobalSearchSheet (풀스크린 모달, 상품·고객·수리 통합) |
| 카탈로그 그리드 | ProductBrowser (카테고리 칩 + 그리드) | ProductsMode (동일 + 자주 쓰는 상품 + ℹ️ 상세) |
| 자주 쓰는 상품 | ❌ | `/api/products/popular` (최근 30일 OrderItem 빈도 상위) |

## 결제 흐름 세부

### v1
1. 카트에 상품/수리/임대 라인 추가
2. 카트 패널에 합계, 할인, 배송비, 견적서, 라벨 액션
3. 결제 버튼 → `/api/pos/checkout` POST (`product + repair + rental` 모두 처리)
4. 결제 후 `/pos` 로 이동

### v2
1. 손님 그리드 → 손님 카드 → 작업 페이지
2. 상품/수리/임대 탭에서 라인 추가
3. 미니카트바 → 카트 시트 (라인 편집 + 전체 할인) → 결제 시트
4. 결제 시트: 다크 합계 카드 + 결제수단 + 자동 라벨 발번 + 자동 영수증 인쇄
5. 결제 후 라벨 인쇄 모달 닫기 → `/pos/v2`

## 폐기 / 의도적 비채택

| 항목 | 사유 |
|---|---|
| 88px 사이드바 | 모바일 11% 차지. 햄버거 + 탭바로 충분 |
| 상단 고객 탭 (PosCustomerHeader) | 사용자 명시 "v2 에선 제거" |
| 채널 선택 (channelId) | POS 매장은 항상 오프라인 (channelId=null) |
| 다크 모드 | 사용자 패스 결정 |
| 수리 v2 사이드바 진입 | 사용자 명시 "v2 끼리만". 햄버거 메뉴에서도 제거 |

## 정책 결정

13. **v1 폐기 시점** — v2 가 만족스러우면 `/pos/*` 폴더 삭제 예정 (사용자 결정).
14. **수리 v2 라우트** — `/pos/repair-v2/*` 는 v2 손님 페이지 안에서만 사용. RepairV2Detail 컴포넌트 공유. 향후 `/pos/v2/_repair/` 로 이전 가능.
15. **디바이스간 공유** — `PosSession` 서버 모델로 sync 완료. localStorage 는 offline fallback.

## 남은 작업 (v2 → v1 패리티)

🔴 결제 흐름 누락 (영향 큼)
- 견적서 발행 (CartSheet 또는 PaymentSheet 에 액션 추가)
- 거래명세표 발행
- 세금계산서 요청 토글

🟠 카트 항목 편집 누락
- 변형 상품 선택 (canonical → variant)
- 영세율 토글 (zeroRateEligible)
- 배송비 입력
- 카트 메모

🟡 페이지 누락
- 고객 페이지 (`/pos/v2/customers`, 고객 상세 v2)

## 파일 구조 참고

```
src/app/(pos)/pos/
├── v2/                          ← v2 메인
│   ├── _components/             공통 컴포넌트 (BottomSheet/MobileCombobox/PriceInputDialog/CategoryChips/ProductGridCard/MenuSheet/CustomerCard/BottomTabBar)
│   ├── _link-customer-sheet.tsx
│   ├── _quick-customer-sheet.tsx
│   ├── _global-search-sheet.tsx
│   ├── _product-search-sheet.tsx
│   ├── _cart-line-row.tsx
│   ├── _cart-sheet.tsx
│   ├── _payment-sheet.tsx
│   ├── _products-mode.tsx
│   ├── _repair-mode.tsx
│   ├── _rental-mode.tsx
│   ├── page.tsx                 ← 손님 그리드
│   ├── customer/[sid]/page.tsx  ← 손님 작업 (탭바)
│   └── product/[id]/page.tsx    ← 상품 상세
├── repair-v2/                   ← v2 와 공유. 추후 v2 안으로 흡수 예정
│   ├── _components, _types, _helpers, _parts-section, _labors-section, _pickup-sheet
│   └── [id]/page.tsx            ← RepairV2Detail (v2 손님 페이지가 import)
├── all, cart, customers, products, repairs/  ← v1 (만족 후 폐기 예정)
└── page.tsx                     ← v1 진입

src/app/(print)/
├── pos-receipt/[id]/print/      ← v2 신규 (80mm 영수증)
├── repairs/[id]/print/
├── serial-items/print/
└── ...

src/app/api/
├── pos/sessions/route.ts        ← v2 신규 (디바이스 sync)
├── products/popular/route.ts    ← v2 신규 (자주 쓰는 상품)
└── ...

src/components/pos/
├── temp-customer.ts             ← v2 신규 (8색 팔레트, 짧은 코드)
├── sessions-context.tsx         ← v1+v2 공용 (서버 sync 추가)
└── ... (v1 전용)
```
