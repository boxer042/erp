# Dashboard — 메인 홈 (`/`)

ERP 운영자가 매일 처음 보는 화면. 사장 시점(이익·자산) + 운영자 시점(처리 대기·알람) 동시 노출이 목표.

진입점: [src/app/(dashboard)/(home)/page.tsx](../src/app/(dashboard)/(home)/page.tsx)
부속:
- [_quick-actions.tsx](../src/app/(dashboard)/(home)/_quick-actions.tsx) — 글로벌 검색 (⌘K) + 빠른 액션
- [_charts.tsx](../src/app/(dashboard)/(home)/_charts.tsx) — recharts 차트 (Area + Pie)
- [_helpers.ts](../src/app/(dashboard)/(home)/_helpers.ts) — fmt / fmtCompact / delta
- [loading.tsx](../src/app/(dashboard)/(home)/loading.tsx) — Suspense 스켈레톤

## 현재 구조 (2026-05-17 기준)

### 헤더
- 사용자 이름 + 인사 (`requireAuth()` 결과 사용)
- 한국어 풀 날짜
- **빠른 액션 바** — POS 시작 / 새 주문 / 새 수리 / 입고 등록 / 지출 등록
- **글로벌 검색** — ⌘K 단축키 → 다이얼로그 → 6개 카테고리(주문·수리·고객·상품·거래처·판매내역) 점프

### 기간 토글
헤더 우측 `JmSegmentedControl` — 오늘 / 이번 주 / 이번 달 / 지난 달 / 지정(`JmDateRangePicker`). URL `?period=&from=&to=` 으로 매출·이익·AOV·반품률·차트 등 _기간 의존 KPI_ 일괄 전환. 시점 기반 KPI (재고·클레임·POS·수리·임대 대기 등) 는 영향 없음.

### KPI 그리드 — 5 row × 4 (모바일은 사장+운영 12개만, 나머지 3 row 는 `CollapsibleKpiSection` 토글)

**사장 KPI** (기간 의존)
| 항목 | 계산 | 비고 |
|---|---|---|
| 매출 | `Σ Order.totalAmount` (`soldOrderWhere`) − `Σ OrderItem.refundedAmount` (PARTIAL_REFUND 차감) | delta vs 직전 기간 |
| 매출총이익 | 매출 − 원가 (`itemCost()` — LotConsumption 우선 / unitCostSnapshot fallback) | 마진율 표시 |
| 영업이익 | 매출총이익 − 수수료 − `Expense` | 음수면 빨강 |
| 재고 자산 | `Σ InventoryLot.remainingQty × unitCost` (활성 로트) | 시점 기반 |

`soldOrderWhere` = `status IN [PREPARING, PREPARING_PACKED, SHIPPED, COMPLETED]` + `paymentStatus NOT IN [REFUNDED, SALES_CANCELLED]` + `exchangedFromOrders: none`.

**운영 알람 KPI** (시점 기반) — 대기 주문 / 클레임 대기 / 채널 이슈 / 재고 경고 / 대기 입고 / POS 활성 / 수리 / 임대. 전부 해당 워크보드로 클릭 점프.

**워크플로 대기 KPI** (5개) — 세금계산서 발행 대기 / 발주 입고 대기 / 견적 응답 대기 (만료 임박 분리) / 신규 고객 (기간) / 30일+ 미수금 (`customerLedger groupBy _min`).

**비즈니스 지표 KPI** (기간 의존) — 객단가(AOV) / 반품률 / 재구매율(90일) / 임대 가동률.

**효율 지표 KPI** — 재고 회전율 / 재고 소진일수(DoI) / 수리 공임 비중 / 재수리율.

### 오늘 현금흐름 카드
4컬럼 — 고객 결제(+) / 거래처 지급(−) / 지출(−) / 순현금흐름. `CustomerRefund` 환불액은 순현금에서 추가 차감하고 hint 로 명시. (시점 기반 — 항상 오늘)

### 차트 (recharts + 커스텀)
- Row 1 (추세): 지난 7일 매출 AreaChart / 최근 6개월 마진율 LineChart
- Row 2 (분포): 채널별 매출 도넛 / 결제 수단 막대 / 카테고리별 매출 도넛
- 시간대 히트맵: 요일(7)×시간(24) 매출 그리드 (`SalesHeatmap` — opacity 농도)
- 전부 ADMIN 전용 (기간 의존)

CSV 내보내기 — 베스트셀러·VIP·데드스톡 `SectionHeader` 에 `CsvButton` (BOM 포함).

### 테이블 그리드
1. 최근 주문 / 이번 달 베스트셀러 (`OrderItem.groupBy productId`)
2. 데드스톡 90일+ (`InventoryLot.receivedAt < today-90d & remainingQty > 0`) / 재고 부족
3. 이번 달 VIP 고객 (`Order.groupBy customerId`) / 거래처 미지급
4. 고객 미수금 (full width)
5. 최근 활동 (`AuditLog` 5건)

## 데이터 페치 패턴
- **서버 컴포넌트** + `Promise.all` 로 약 55개 쿼리 병렬 실행
- 대부분 `count` / `aggregate` / `groupBy` — 로드 부담 미미. 단 `OrderItem.findMany` (마진/카테고리/추이) 와 히트맵용 `Order.findMany` 는 주문 규모 100k+ 면 부담 (§남은 작업 I)
- 캐시 없음 (매 요청마다 fresh). 수동 새로고침은 `router.refresh()`

## JmScope cascade
[dashboard-shell.tsx](../src/components/layout/dashboard-shell.tsx) 의 outer wrapper 가 `JmScope` 로 통합되어 사이드바·헤더·본문 children 모두 한 scope 안. 다크 모드 토큰 cascade 정상.

---

## 남은 작업 (우선순위순)

### A. 정확성·신뢰성 (높음 — 데이터 정의 흔들리면 사장 혼란)

- [x] **매출 정의 통일** *(2026-05-15)* — `soldOrderWhere` 로 통일: `status IN [PREPARING+]` + `paymentStatus NOT IN [REFUNDED, SALES_CANCELLED]` + `-EX 제외`. 그 후 `OrderItem.refundedAmount` 합으로 `PARTIAL_REFUND` 차감. `/sales/history` netAmount 정의와 동기화
- [x] **미수금 30일+ 정밀 계산** *(2026-05-15)* — `customerLedger.groupBy({by: customerId, _min: createdAt, where: {type: SALE}})` + 잔액 > 0 고객만 join. 가장 오래된 SALE ledger 진입일이 D-30 전인 고객 카운트
- [x] **마진 계산 fallback** *(2026-05-15)* — OrderItem.findMany 에 `lotConsumptions` include. `itemCost()` 헬퍼: LotConsumption 있으면 `Σ qty × unitCost`, 없으면 `unitCostSnapshot × quantity` fallback
- [x] **활성 고객 (30일) 정의** *(2026-05-15 batch 3)* — `soldOrderWhere` 적용해 정상 매출 거래만 카운트 (취소·반품·매출취소 제외)
- [x] **세금계산서 발행 대기 KPI** *(2026-05-17 batch 6)* — 별도 `TaxInvoice` 모델 불필요. `Order.taxInvoiceRequested && taxInvoicedAt=null && status≠CANCELLED` 로 카운트. 워크플로 대기 row 5번째 KPI, `/tax-invoices/pending` 점프

### B. 인터랙티브화 (중간 — UX 효율)

- [x] **KPI 클릭 점프** *(2026-05-15)* — `ClickableStat` 헬퍼 (외부 `<Link>` + `interactive` prop). 18 KPI 전부 해당 워크보드/리포트로 점프. nav 매핑: 매출→sales/history, 영업이익→reports/income-statement, 대기주문→orders, 클레임→orders/claims, 채널이슈→channels/imports, 재고경고/자산→inventory/lots, 입고→inventory/incoming, POS→pos, 수리→repairs, 임대→rentals, 발주→purchase-orders, 견적→quotations, 신규고객/재구매→customers, 30일+미수→customers/ledger, 임대 가동률→rental-assets
- [x] **기간 필터 토글** *(2026-05-15)* — URL `?period=today|this-week|this-month|last-month` 으로 매출/마진/영업이익/AOV/반품률/채널/베스트셀러/VIP/결제수단/신규고객 범위 + delta 비교 기간 동시 전환. `_period-toggle.tsx` (`JmSegmentedControl`) + `periodRange()` 헬퍼. 시점 기반 KPI (재고/클레임/POS/수리/임대) 는 영향 없음
- [x] **사용자 지정 기간** *(2026-05-15 batch 3)* — `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`. `JmDateRangePicker` (2개월 동시) 노출 + `periodRange()` custom 분기. 잘못된 범위는 `this-month` 폴백
- [x] **데이터 새로고침** *(2026-05-16 batch 5)* — `_refresh-button.tsx` (`router.refresh()` + `useTransition`). 헤더에 "HH:MM 기준" + 새로고침 버튼. polling 은 미도입 (수동 새로고침으로 충분 판단)
- [ ] **클라이언트 컴포넌트 전환** — 현재 server component 라 새로고침마다 ~55 쿼리 재실행. `useQuery` + `/api/dashboard/summary` 로 전환하면 캐시·polling·optimistic 가능. ROI 모호 — 보류 (server component + router.refresh 로 실용 충분)

### C. 비즈니스 지표 (중간 — 운영 인사이트)

- [x] **객단가 (AOV)** *(2026-05-15)* — 매출 / 주문 수. 기간 토글 따라감
- [x] **반품률** *(2026-05-15)* — 이번 달 `RETURNED` / (정상 매출 + RETURNED). 0 가드
- [x] **임대 가동률** *(2026-05-15)* — `RentalAsset status=RENTED` / `status NOT IN [RETIRED]`
- [x] **재구매율** *(2026-05-15)* — 지난 90일 2회+ 구매 고객 / 90일 활성 고객 (`order.groupBy customerId _count`)
- [x] **결제 수단별 분포** *(2026-05-15)* — `Order.groupBy paymentMethod`. `PaymentMixBars` 컴포넌트 (가로 막대 + %)
- [x] **마진율 추이** *(2026-05-15 batch 3)* — 지난 6개월 월별 line chart. 단일 `orderItem.findMany` (6개월치) → 메모리 월별 그룹핑. `MarginTrendLine` 컴포넌트 (recharts LineChart, success-solid 색)
- [x] **카테고리별 매출 분포** *(2026-05-15 batch 3)* — Product.categoryId groupBy 도넛. `ChannelDonut` 컴포넌트 재사용 (같은 시그니처)
- [x] **재고 회전율 / DoI** *(2026-05-16 batch 4)* — 회전율 = 기간 매출원가 / 현재 재고 자산. DoI = 재고 자산 / 일평균 매출원가. 기존 `monthlyCost`·`inventoryAssetValue` 재활용 (추가 쿼리 없음)
- [x] **수리 통계** *(2026-05-16 batch 4)* — 공임 비중 (`RepairLabor.totalPrice` / (labor+part)), 재수리율 (`parentRepairTicketId` 있는 티켓 / 기간 접수). 기간 PICKED_UP / receivedAt 기준

### D. 시각화 확장 (중간)

- [ ] **매출 vs 비용 stacked bar** — 당월 일별, 매출/매출원가/수수료/비용
- [ ] **매출 목표 vs 달성률 게이지** — 목표 모델 신규 필요
- [x] **시간대별 매출 히트맵** *(2026-05-17 batch 6)* — 요일(7)×시간(24) 매출 그리드. `SalesHeatmap` (서버 컴포넌트, opacity 농도 + title 툴팁). 가로 스크롤. ADMIN 전용

### E. 알림·운영 보조 (낮음)

- [ ] **다음 주 만료 견적 상세** — D-7 이내 SENT 견적 리스트
- [ ] **D+7 미수령 수리 상세 리스트** — 카운트 → 클릭 시 상세 시트
- [ ] **현금 부족 경고** — 발주 잔여 합 vs 잔액 (잔액 모델 필요)
- [ ] **저장된 상담 미리보기** — `PosSession parkedAt` 가장 오래된 N개. 1주일 넘은 상담은 알람

### F. 시스템·운영 건강도 (낮음)

- [ ] **설정 누락 경고** — CompanyInfo / 카드수수료율 / 회사 계좌 / 배송 설정 미완료 시 카드
- [ ] **외부 채널 health** — 마지막 polling 성공 시각 (`ChannelAdapter` last poll 추적 모델 신규)
- [ ] **DB 운영 규모** — 주문/수리/임대 누적 총합 (작은 정보 위젯)

### G. 권한·맞춤화 (낮음 — STAFF/ADMIN 분리되면 가치 큼)

- [x] **역할별 KPI** *(2026-05-16 batch 5)* — `user.role === "ADMIN"` 분기. STAFF 는 사장 KPI·비즈니스/효율 지표·현금흐름·매출 차트·VIP/미지급/미수금 테이블 숨김. 운영 알람·워크플로 대기·최근 주문·재고·감사로그만 노출
- [ ] **카드 보이기/숨기기 토글** — 사용자별 설정 모델 신규
- [ ] **위젯 순서 사용자 지정** — drag & drop

### H. 모바일 최적화 (중간)

- [x] **컴팩트 모드** *(2026-05-15)* — 워크플로 대기 row + 비즈니스 지표 row 를 `hidden md:grid` 처리. 모바일에선 사장 KPI 4 + 운영 알람 8 만 노출, 데스크톱에선 추가 8개 KPI 까지
- [x] **모바일 KPI 추가 토글** *(2026-05-15 batch 3)* — `CollapsibleKpiSection` 클라이언트 컴포넌트. 모바일에서 "더 보기" 버튼 (ChevronDown), 클릭 시 그리드 펼침. 데스크톱은 항상 표시
- [x] **차트 모바일 가독성** *(2026-05-16 batch 4)* — 도넛(`ChannelDonut`) 모바일에선 세로 배치 (도넛 위 / 범례 아래), `sm+` 에서 가로. 범례 폭 제한도 `sm:max-w-[200px]`

### I. 성능 (큰 데이터에서만 문제)

- [ ] **`OrderItem.findMany` 캐시** — 주문 100k+ 환경에서 매월 비용 계산 부담. raw SQL `SUM(qty × unitCostSnapshot)` 또는 `revalidate` 캐시
- [ ] **Suspense streaming** — 차트·테이블 별도 fetch 로 분리해 KPI 먼저 보여주기
- [ ] **React Cache / Next revalidate** — 이번 달 매출 같은 정적 지표는 5분 캐시

### J. 도큐·도구

- [x] **`/help` 페이지** *(2026-05-16 batch 5)* — `(home)/help/page.tsx`. KPI 의미·계산식, 기간 토글·권한 동작 설명. 대시보드 헤더 "가이드" 링크에서 진입
- [x] **CSV 내보내기** *(2026-05-17 batch 6)* — `CsvButton` (`_csv-export.tsx`, BOM 포함 — Excel 한글). `SectionHeader` 의 `csv` prop. 베스트셀러·VIP·데드스톡 테이블에 적용
- [ ] **위젯별 deeplink** — `/?widget=cash-flow` 식 anchor

---

## 의존성·전제

- **3축 주문 모델** (출고/결제/클레임) 이해 필요 — [docs/ORDERS_SYSTEM.md](ORDERS_SYSTEM.md)
- **POS 운영 흐름** — [docs/POS.md](POS.md)
- **외부 채널 import 구조** — `ChannelOutboundJob` / `PendingChannelOrder` / `ChannelProductMapping`
- **jm 디자인 시스템** — [src/jm/DESIGN.md](../src/jm/DESIGN.md). 모든 신규 위젯은 `Jm*` prefix + `var(--jm-*)` 토큰

## 변경 이력

- **2026-05-15** — shadcn → jm 마이그레이션. JmScope cascade 수정. KPI 6 → 20개 (사장 4 + 운영 알람 8 + 워크플로 대기 4 + 비즈니스 지표 4). 빠른 액션 + 글로벌 검색 (⌘K). 차트 3개 (7일 매출 추이 / 채널 도넛 / 결제수단 막대). 베스트셀러/데드스톡/VIP/감사로그 테이블 추가.
- **2026-05-15 (정확성 batch)** — 매출 정의 `/sales/history` netAmount 와 동기화 (PARTIAL_REFUND 차감 + SALES_CANCELLED·REFUNDED 제외). 마진 계산 LotConsumption 우선 + unitCostSnapshot fallback. 미수금 30일+ 정밀 계산 (customerLedger groupBy _min). 비즈니스 지표 4개 (AOV/반품률/재구매율/임대 가동률) + 결제수단 분포 차트.
- **2026-05-15 (인터랙티브 batch)** — 기간 토글 (`?period=today|this-week|this-month|last-month`) — 매출·이익·AOV·반품률 등 영향. 18 KPI 전부 `ClickableStat` 으로 해당 워크보드 점프. 모바일 컴팩트 모드 (워크플로 대기 + 비즈니스 지표 row 모바일 숨김).
- **2026-05-15 (batch 3 — 정의·UX·시각화 확장)** — (1) 활성 고객 정의를 `soldOrderWhere` 와 동기 (정상 매출만). (2) 사용자 지정 기간 `?period=custom&from=&to=` — `JmDateRangePicker` 2개월 동시 표시 + custom 검증 (잘못된 범위는 this-month 폴백). (3) 모바일 KPI 추가 토글 `CollapsibleKpiSection` (펼침/접기). (4) 최근 6개월 마진율 추이 line chart (`MarginTrendLine`, 단일 orderItem 페치 → 메모리 그룹핑). (5) 카테고리별 매출 도넛 (Product.categoryId). 차트 섹션 1→2 row (추세 2 + 분포 3).
- **2026-05-16 (batch 4 — 효율 지표 + 모바일)** — (1) 효율 지표 KPI row 추가 — 재고 회전율 / 재고 소진일수(DoI) / 수리 공임 비중 / 재수리율 (KPI 5 row · 24개). (2) 도넛 차트 모바일 세로 배치 (`ChannelDonut` — sm 미만 도넛↑범례↓).
- **2026-05-16 (batch 5 — 권한·새로고침·도움말)** — (1) 역할별 KPI — `user.role` 분기, STAFF 는 재무 지표(매출/이익/자산/현금흐름/매출 차트/금액 테이블) 숨김. (2) `ClickableStat` 을 클라이언트 컴포넌트로 분리 (서버 컴포넌트에서 interactive JmStat 이 이벤트 핸들러 못 붙이는 버그 수정). (3) 새로고침 버튼 `_refresh-button.tsx` (`router.refresh()` + 렌더 시각). (4) `/help` 대시보드 가이드 페이지.
- **2026-05-17 (batch 6 — 세금계산서·CSV·히트맵)** — (1) 세금계산서 발행 대기 KPI (`Order.taxInvoiceRequested` — 모델 신규 불필요). 워크플로 대기 row 5개로 확장 (`CollapsibleKpiSection` `cols` prop). (2) CSV 내보내기 — `CsvButton` (`_csv-export.tsx`, BOM), `SectionHeader.csv` prop. 베스트셀러·VIP·데드스톡 적용. (3) 요일×시간 매출 히트맵 (`SalesHeatmap`, opacity 농도).
