# 중고상품 도메인 설계

**상태**: ✅ Phase 1~5 구현 완료 (2026-05-29, main 머지) — e2e 16/16 통과
**작성일**: 2026-05-29
**구현 커밋**: `d0f5374` (Phase 1~4) · `ac4449e` (Phase 5) — main 통합 완료

> 아래는 합의된 설계 + 구현 결과. 미구현/보류 항목은 §11.6 · §12.3 참고.

---

## 1. 도메인 배경

매장이 다루는 중고는 신품 카탈로그와 본질적으로 다른 lifecycle 을 가짐:

- **카탈로그 신품**: 매장이 다루기로 결정한 모델. 반복 매입·매대 노출·BOM 정의 등 지속성 있음.
- **중고**: 매번 다른 출처에서 들어오는 일회성 개체. 같은 모델이라도 단품마다 상태·원가·이력이 다름.

### 1.1 매장 운영 현실

- **약 50% 가 비카탈로그 매입** — 매장이 평소 다루지 않는 모델까지 중고로 들어옴
- **단품 정체성이 매우 강함** — 같은 모델이라도 "이 한 대"의 매입가/리퍼비시 비용/판매가가 다름
- **보관 기간 천차만별** — 즉시 판매부터 1년 이상 창고 보관까지
- **단품 판매 빈도 낮음** — 부품 중고는 단독 판매보다 조립 부속으로 활용되는 비율이 압도적

### 1.2 핵심 출처 4가지

| 출처 | 원가 | 예시 |
|---|---|---|
| `PURCHASED` | 매입가 | 손님에게서 매입한 중고 엔진톱 |
| `SCAVENGED` | 0 | 손님이 매장에 버리고 간 기기에서 탈거한 부속 |
| `RENTAL_RETIREMENT` | 감가상각 잔존가 (또는 0) | 임대 자산이 lifecycle 끝나서 중고로 전환 |
| `EMERGENCY_USE` | 사후 입력 | 시스템 등록 전 급매 (POS 자유 라인) → 사후 정리 |

---

## 2. 핵심 결정 — 별도 도메인 분리

**`Product` 카탈로그는 신품만 유지하고, 중고는 별도 `UsedItem` 도메인으로 격리한다.**

### 2.1 왜 별도 도메인인가

- 50% 가 비카탈로그면 `Product` 테이블에 정식 등록 시 1년이면 수백 개 좀비 SKU 누적
- 매장 카탈로그·매대·BOM 정의는 "재사용 가능한 모델 단위" 이어야 일관성 유지
- 중고는 단발성 인스턴스 — 출처·매입가·매입처·사후 비용 가산 등 별도 필드 다수
- 임대 자산 → 중고 전환 같은 lifecycle 핸드오프가 자연스러워짐
- 다른 시스템(중고차 딜러, 전당포, 음악기기 매장 Reverb 등)도 모두 "카탈로그 ≠ 인스턴스" 분리 패턴

### 2.2 안 분리하면 생기는 문제 (참고)

비교 검토했던 옵션 중 기각한 것:
- 매입마다 임시 Product 자동 생성 (`visibility=INTERNAL`) — Product 테이블 부풀음 + 임대→중고 같은 lifecycle 어색
- 같은 모델은 같은 Product 의 다른 lot 으로만 — 비카탈로그 매입을 흡수 못 함

---

## 3. 케이스 분류

### 3.1 단품 정체성 기준

| 종류 | 시리얼 발번 | 매대 노출 | 예시 |
|---|---|---|---|
| **완제품 중고** | 필요 | 노출 | 중고 엔진톱 (그대로 단품 판매 가능) |
| **부품 중고** | 불필요 (선택) | 미노출 (조립 시 BOM에 끼움) | 중고 엔진/체인/기화기 (단독 판매 거의 안 됨) |

### 3.2 카탈로그 매칭 기준

| 종류 | UsedItem.productId | 매대 검색 |
|---|---|---|
| **카탈로그 매칭** | 기존 Product 참조 | 신품과 같은 검색 결과에 묶임 |
| **비카탈로그** | null | UsedItem 자체로만 검색 |

**예시**:
- "센다이엔진 SD225R" (`P260427-ZPCU`) 의 중고 → `UsedItem.productId = "P260427-ZPCU"` (매칭)
- "센다이 외 다른 엔진 SD200" → `UsedItem.productId = null` (비카탈로그)

---

## 4. 모델 설계

### 4.1 새 모델 — `UsedItem`

```prisma
model UsedItem {
  id              String          @id @default(uuid())
  internalCode    String          @unique  // UU{YYMMDD}-NNNN
  displayName     String          // 자유 입력 (비카탈로그도 OK)
  productId       String?         @map("product_id")  // 카탈로그 매칭되면 link
  product         Product?        @relation(fields: [productId], references: [id], onDelete: SetNull)

  acquiredFrom    UsedItemSource  // PURCHASED | SCAVENGED | RENTAL_RETIREMENT | EMERGENCY_USE
  acquiredCost    Decimal         @default(0) @db.Decimal(15, 2)
  // VAT 처리 — 95% 개인 매입이라 기본 false (받은 금액 = 공급가액). 사업자 매입으로 세금계산서 받는 드문 케이스만 true (받은 금액 ÷ 1.1 = 공급가액).
  // 기존 IncomingCost / SellingCost 의 isTaxable 패턴과 동일.
  isAcquiredTaxable Boolean       @default(false) @map("is_acquired_taxable")
  acquiredAt      DateTime        @map("acquired_at")
  sourceCustomerId String?        @map("source_customer_id")  // 매입처 (등록 고객)
  sourceCustomer  Customer?       @relation(fields: [sourceCustomerId], references: [id], onDelete: SetNull)
  sourceMemo      String?         @map("source_memo")          // 매입처가 비등록일 때 자유 텍스트

  status          UsedItemStatus  @default(IN_STOCK)  // IN_STOCK | ASSEMBLED_INTO | SOLD | SCRAPPED
  spec            String?
  imageUrls       Json?           @map("image_urls")
  memo            String?

  // 사후 비용 가산 (수리·부품 교체)
  addedCosts      UsedItemCost[]

  // 결과 lineage — 활용된 곳 (배타적, 셋 중 하나)
  assemblyId      String?         @map("assembly_id")   // 조립에 흡수
  orderItemId     String?         @map("order_item_id") // 단품 판매
  rentalAssetId   String?         @map("rental_asset_id") // 임대 자산에서 전환된 출처 (역방향)

  // SerialItem 1:1 link (발번된 경우만, 완제품 중고용)
  serialItemId    String?         @unique @map("serial_item_id")
  serialItem      SerialItem?     @relation(fields: [serialItemId], references: [id], onDelete: SetNull)

  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  createdById     String?         @map("created_by_id")

  @@index([productId])
  @@index([status])
  @@index([acquiredFrom])
  @@index([sourceCustomerId])
  @@map("used_items")
}

enum UsedItemSource {
  PURCHASED
  SCAVENGED
  RENTAL_RETIREMENT
  EMERGENCY_USE
}

enum UsedItemStatus {
  IN_STOCK         // 보관 중 — 매대 노출 대상
  ASSEMBLED_INTO   // 조립에 흡수됨 — 매대 미노출
  SOLD             // 단품 판매 완료 — 매대 미노출
  SCRAPPED         // 폐기
}
```

### 4.2 새 모델 — `UsedItemCost` (사후 비용 가산)

```prisma
model UsedItemCost {
  id            String              @id @default(uuid())
  usedItemId    String              @map("used_item_id")
  usedItem      UsedItem            @relation(fields: [usedItemId], references: [id], onDelete: Cascade)
  costType      UsedItemCostType    // PART | LABOR | OTHER
  amount        Decimal             @db.Decimal(15, 2)
  description   String
  referenceType String?             @map("reference_type") // REPAIR_TICKET | MANUAL
  referenceId   String?             @map("reference_id")
  createdAt     DateTime            @default(now()) @map("created_at")

  @@index([usedItemId])
  @@map("used_item_costs")
}

enum UsedItemCostType {
  PART
  LABOR
  OTHER
}
```

### 4.3 기존 모델 변경 — `SerialItem` 확장

```prisma
// 변경 1: soldAt nullable
model SerialItem {
  ...
  soldAt DateTime? @map("sold_at")  // 발번 시점에 안 팔린 상태 허용
  ...
}

// 변경 2: source enum 추가
enum SerialItemSource {
  SALE
  REPAIR
  USED_INTAKE  // ← 신규: 중고 매입 시점 발번
}
```

### 4.4 기존 모델 변경 — `RentalAsset` (lifecycle 핸드오프)

```prisma
model RentalAsset {
  ...
  // 중고로 전환된 경우 양방향 link
  convertedUsedItemId String?    @unique @map("converted_used_item_id")
  ...
}
```

### 4.5 Assembly 자유 라인 — `AssemblyUsedItemConsumption`

```prisma
model AssemblyUsedItemConsumption {
  id          String   @id @default(uuid())
  assemblyId  String   @map("assembly_id")
  assembly    Assembly @relation(fields: [assemblyId], references: [id], onDelete: Cascade)
  usedItemId  String   @map("used_item_id")
  usedItem    UsedItem @relation(fields: [usedItemId], references: [id])
  costSnapshot Decimal @db.Decimal(15, 2)  // 흡수 시점 비용 (acquiredCost + addedCosts 합)
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([assemblyId])
  @@index([usedItemId])
  @@map("assembly_used_item_consumptions")
}
```

---

## 5. 페이지 구조

```
src/app/(dashboard)/
├── products/                       ← 신품 카탈로그 (변경 없음)
│   ├── new                           정식 카탈로그 등록
│   ├── [id]                          상세 + (NEW) "이 모델 중고 N대" 배지
│   └── assembly-templates            BOM 레시피 (Product 만)
│
├── inventory/
│   ├── incoming                      신품 매입 (기존)
│   ├── assembly                      조립 실행 (+ NEW: UsedItem 자유 라인 영역)
│   ├── used-items/    ⭐ 신규        중고 도메인 전용
│   │   ├── page.tsx                    목록 (IN_STOCK 기본 + 보관 기간 + 매입가 합계)
│   │   ├── new                         매입 등록 폼
│   │   └── [id]                        단품 상세 + 비용 가산 + 상태 액션
│   └── ... (returns, stocktake, etc.)
│
├── rental-assets/
│   └── [id]                          + (NEW) "[중고로 전환]" 액션 → UsedItem 자동 생성
│
└── ...
```

### 5.1 `/inventory/used-items` 책임 명세

**목록 페이지**:
- 기본 필터: `status=IN_STOCK`
- 컬럼: 사진 / 품명 / 출처 / 매입가 / 누적비용 / 보관일수 / 카탈로그매칭 여부 / 상태
- 정렬: 보관일수 desc (오래 보관된 것 우선 visibility)

**매입 등록 폼** (`/new`):
- 품명 (자유 입력 또는 카탈로그 Product 선택)
- 매입 출처 (`PURCHASED` / `SCAVENGED` / `RENTAL_RETIREMENT` / `EMERGENCY_USE`)
- 매입가 (또는 0)
- 매입처 (Customer 선택 or 자유 텍스트 or null)
- (선택) 스펙 · 사진 · 메모
- (선택) 시리얼 발번 토글 — 단품 판매 가능 케이스만

**상세 페이지** (`/[id]`):
- 매입 정보 + 사진 + 출처 정보
- 비용 가산 카드 (`UsedItemCost` 추가/삭제)
- 활용 history (lineage — Assembly / Order / 폐기)
- 상태 전환 액션:
  - `[조립에 끼우기]` → `/inventory/assembly?usedItemId=...`
  - `[단품 판매]` → `/pos?addUsedItem=...`
  - `[폐기]` → status=SCRAPPED
  - `[시리얼 발번]` (선택, 단품 판매 가능 케이스)

---

## 6. 매대 노출 정책

### 6.1 매대 종류 (4종)

| 코드 | 매대 | 위치 | 누가 봄 |
|---|---|---|---|
| (a) | 고객 랜딩 | `src/app/(landing)/...` | 인터넷 일반 손님 |
| (b) | POS 결제 검색 | `src/app/(pos)/pos/customer/[sid]` 상품 추가 다이얼로그 | 매장 직원 (frontline) |
| (c) | ERP 카탈로그 | `src/app/(dashboard)/products` | 매장 직원 (백오피스) |
| (d) | 견적서·명세표 검색 | QuotationSheet / StatementSheet | 매장 직원 (B2B) |

### 6.2 노출 정책 (확정)

| 매대 | 신품 | 비카탈로그 중고 | 카탈로그 매칭 중고 |
|---|---|---|---|
| (a) 고객 랜딩 | 매장 결정 (LandingSettings) | **노출** ✓ | **노출** ✓ |
| (b) POS 결제 검색 | 노출 ✓ | **노출** (옵션 3 — 행 분리 + "중고" 배지) | **노출** (행 분리 + 배지) |
| (c) ERP 카탈로그 | 노출 ✓ | **노출 안 함** | **노출 안 함** |
| (d) 견적서·명세표 | 노출 ✓ | **재고 있으면 노출, 판매되면 자동 숨김** | 동일 |

### 6.3 공통 원칙 — "재고 있으면 노출, 판매되면 자동 숨김"

POS / 자사몰 / 견적서 모두 동일:
- `UsedItem.status === "IN_STOCK"` 일 때만 노출
- `ASSEMBLED_INTO` / `SOLD` / `SCRAPPED` 되면 즉시 매대에서 사라짐
- Product 와 달리 "재고 0 인데 매대 잔존" 같은 좀비 row 없음 (단품 1수량 lifecycle)

### 6.4 (b) POS 검색 표시 디테일

**현재 POS 검색 동작** ([_products-mode.tsx:94-102](src/app/(pos)/pos/_products-mode.tsx#L94-L102)):
- 상품 그리드 자체를 메모리 필터링 (`name` 또는 `sku` 부분일치)
- 별도 검색 결과 다이얼로그 아님 — `ProductGridCard` 그리드가 검색어로 좁혀짐
- 카테고리 그리드 ↔ 검색 모드 자동 전환

**중고 표시 방식 = 같은 그리드에 카드로 통합 + "중고" 배지**:

```
[검색: 센다이 엔진]

┌──────────────┬──────────────┬──────────────┐
│              │      [중고]   │      [중고]   │
│  센다이엔진   │  센다이엔진   │  센다이 외    │
│  SD225R     │  SD225R      │  엔진 SD200  │
│  ₩150,000   │  ₩50,000     │  ₩80,000    │
│  재고 5      │  1대 남음     │  1대 남음    │
└──────────────┴──────────────┴──────────────┘
   ↑ 신품 카드     ↑ 카탈로그     ↑ 비카탈로그
                  매칭 중고       중고
```

**규칙**:
- UsedItem 도 ProductGridCard 변형(또는 같은 카드)으로 그리드에 함께 표시
- 카드 우상단 `[중고]` 배지로 시각 구별 (테마 색상 — warning 또는 별도 톤)
- 중고는 단품 1개라 "1대 남음" 라벨 명시
- 가격 차이가 자연스럽게 보임 (옆에 신품 ₩150,000 / 중고 ₩50,000)
- 카드 탭 시 일반 상품과 동일 흐름으로 카트 추가 (가격 0원이면 가격 입력 다이얼로그)
- 정렬: 카탈로그 매칭 중고는 같은 모델 신품 카드 바로 옆, 비카탈로그 중고는 그 다음

**검색 쿼리 통합**:
- 기존 `allProductsQuery` 의 결과에 UsedItem (status=IN_STOCK) 합쳐서 필터링
- 또는 별도 `allUsedItemsQuery` 추가하고 메모리에서 merge
- name/sku 매칭 외에 카탈로그 매칭 UsedItem은 해당 Product 검색에도 hit (productId join)

---

## 7. Assembly 자유 컴포넌트 라인

### 7.1 분리 원칙

| 페이지 | 책임 |
|---|---|
| `/products/new`, `/products/assembly-templates` | **BOM 레시피 정의** — 카탈로그 Product 만 (어떤 모델이 들어가는가) |
| `/inventory/assembly` | **실제 조립 실행** — 구성품 슬롯마다 신품 Product / UsedItem 선택 |

### 7.2 조립 실행 — 구성품 검색에 UsedItem 통합 (A6 정책)

**현재 UI 그대로 유지**. 구성품 검색 드롭다운의 결과 목록에 **IN_STOCK UsedItem 만 추가로 등장**하도록 검색 API 만 확장.

```
[조립 실적 등록] — UI 변경 없음
구성품 검색 드롭다운에서 "센다이 엔진" 검색
─────────────────────────────────────────
결과:
  ▸ 센다이 엔진 SD225R          ← 기존 신품 Product hit
  ▸ 센다이 엔진 SD225R (중고)    ← UsedItem 카탈로그 매칭 (displayName 에 자동 prefix)
  ▸ 센다이 외 엔진 SD200 (중고)  ← UsedItem 비카탈로그
─────────────────────────────────────────
```

**선택 시 분기** (백엔드):
- **신품 Product 선택** → 기존 `fifoConsume(productId, qty)` 흐름 그대로
- **UsedItem 선택** → 그 UsedItem 의 lot 직접 차감 + `UsedItem.status = ASSEMBLED_INTO` + `AssemblyUsedItemConsumption` row 생성

**핵심**:
- **UsedItem 1개 = lot 1개**라 "lot 명시 선택" 이슈 자체 없음. UsedItem 선택 = 그 단품 차감. 자명.
- 사용된 UsedItem 은 다음 검색에서 자동으로 사라짐 (status ≠ IN_STOCK)
- 결과 lot.unitCost = Σ (신품 lot.unitCost × qty) + Σ UsedItem (acquiredCost + addedCosts)
- 결과 SerialItem 자동 발번 (옵션, 결과 Product 가 단품 판매 대상이면)

**작업량 (최소)**:
- 백엔드: 구성품 검색 API 가 UsedItem (status=IN_STOCK) 도 결과에 포함, 선택 시 분기 처리 (~1일)
- 프론트: UI 변경 없음. 검색 결과 라벨에 `(중고)` 자동 prefix 만 (~10분)

---

## 8. 마진·원가 계산

### 8.1 단품 판매 시

```
OrderItem.unitCostSnapshot = UsedItem.acquiredCost + Σ UsedItemCost.amount
```

### 8.2 조립 흡수 시

```
Assembly 결과 lot.unitCost = Σ AssemblyComponentConsumption (정형 lot · unitCost × qty)
                          + Σ AssemblyUsedItemConsumption (UsedItem · costSnapshot)
```

이후 그 결과 lot 가 판매될 때 기존 FIFO/LotConsumption 흐름 그대로 작동 → OrderItem.unitCostSnapshot 자동.

### 8.3 마진 리포트

기존 `/api/reports/margin/route.ts` 의 LotConsumption 우선 + unitCostSnapshot fallback 흐름 그대로. UsedItem 직접 판매도 OrderItem.unitCostSnapshot 으로 흡수되므로 추가 분기 거의 없음.

---

## 9. 워크플로 시나리오 — End to End

### 9.1 케이스 1: 손님이 버리고 간 부속 (`SCAVENGED`)

```
① 매장 직원: /inventory/used-items/new
   품명: "센다이 엔진 SD225R (탈거품)"
   출처: SCAVENGED
   매입가: 0
   카탈로그 매칭: P260427-ZPCU 선택
   시리얼 발번: OFF (조립 부속으로만 쓸 예정)
   → UsedItem 생성, status=IN_STOCK

② 한 달 후 조립 실행: /inventory/assembly
   "고압분무기 SD220R" 조립 인스턴스
   엔진 lot 선택 시 — 신품 3개 / 중고(카탈로그 매칭) 0개 / UsedItem 1개 보임
   → UsedItem 자유 라인으로 끼움
   → 결과 lot.unitCost = 몸체 + 호스 + 0 (UsedItem 매입가 0)
   → UsedItem.status = ASSEMBLED_INTO

③ 손님 구매: /pos
   고압분무기 SD220R 판매 → OrderItem.unitCostSnapshot 자동 산출
   → 마진 = 판매가 - 정형 부속 단가만 (UsedItem 비용 0이라 사실상 풀 마진)
```

### 9.2 케이스 2: 임대 자산 → 중고 판매 (`RENTAL_RETIREMENT`)

```
① 매장 직원: /rental-assets/[id] 에서 [중고로 전환] 클릭
   → RentalAsset.status = RETIRED
   → UsedItem 자동 생성 (acquiredFrom=RENTAL_RETIREMENT, acquiredCost=감가상각 잔존가)
   → RentalAsset.convertedUsedItemId 양방향 link
   → 자동으로 /inventory/used-items/[id] 이동

② 매장 직원: 상세 페이지에서 시리얼 발번 (완제품 단품 판매할 예정)
   → SerialItem 생성, source=USED_INTAKE, productId=UsedItem.productId, soldAt=null

③ 손님 구매 (POS 또는 자사몰):
   → SerialItem.customerId/orderItemId/soldAt 채움
   → UsedItem.status = SOLD
   → 매대에서 즉시 사라짐
```

### 9.3 케이스 3: 시스템 미등록 상태 급매 (`EMERGENCY_USE`)

```
① 손님 매장 방문, "이 부속 필요해요" 즉시 결제 필요
   POS: 자유 라인 (productId 없음, 이름 + 가격 만) → 결제 완료
   → OrderItem.serviceName="기타 부속" 같이 저장 (현재 흐름 그대로)

② 야간 정리 또는 매장 직원 사후 정리:
   /inventory/used-items/new
   - 출처: EMERGENCY_USE
   - 매입가: 0 (또는 매장 추정)
   - 연결 OrderItem 선택 → orderItemId link, status=SOLD 즉시
   → 마진 리포트에서 원가 사후 보정

(선택) 사후 정리 안 하면 그냥 service 라인으로만 잔존 — 원가 추적 포기, 수익만 잡힘
```

### 9.4 케이스 4: 카탈로그 매칭 중고를 단품 판매 (앞서 논의)

```
① /inventory/used-items/new
   품명: "센다이 엔진 SD225R"
   카탈로그 매칭: P260427-ZPCU
   출처: PURCHASED, 매입가: 50,000
   시리얼 발번: ON

② POS 검색에서 "센다이 엔진" 입력
   → 결과: 신품 5개 (₩150,000) [신품 행]
            UsedItem 1개 (₩50,000) [중고 행]
   → 손님이 중고 선택 → 결제

③ UsedItem.status = SOLD, SerialItem 손님 정보 채움
   → 매대에서 사라짐
```

### 9.5 케이스 5: 비카탈로그 중고를 조립 활용

```
① /inventory/used-items/new
   품명: "센다이 외 엔진 SD200"
   카탈로그 매칭: 없음 (productId=null)
   출처: PURCHASED, 매입가: 80,000

② /inventory/assembly
   "고압분무기 SD220R" 조립
   추가 부속 영역에 UsedItem 끼움
   → AssemblyUsedItemConsumption 생성, costSnapshot=80,000
   → 결과 lot.unitCost 에 합산

③ 손님 구매 → 정확한 마진 계산
```

---

## 10. 시리얼 발번 정책

### 10.1 매입 등록 폼의 시리얼 발번 토글

매입 등록 폼에 **체크박스 토글** — 매장 직원이 단품 판매 가능 여부 판단해 ON/OFF:

```
[중고 매입 등록]
─────────────────────────────────────────
품명, 출처, 매입가, 매입처 ...
─────────────────────────────────────────
☑ 시리얼 라벨 발번  ← 토글 (기본값 자동)
  └ 단독 판매 가능한 상태라 추적용 라벨 출력
─────────────────────────────────────────
```

**기본값 자동 산정**:
| 조건 | 기본 토글 |
|---|---|
| 카탈로그 매칭됨 (`productId != null`) | ☑ ON |
| 비카탈로그 + 부품 추정 (출처가 SCAVENGED, 단가 낮음 등) | ☐ OFF |
| 임대 → 중고 전환 (`acquiredFrom=RENTAL_RETIREMENT`) | ☑ ON (보통 완제품) |

매장 직원이 자유 토글 가능. ON 이면 UsedItem 생성과 동시에 SerialItem 1건 자동 발번.

**참고**: 신품 Product 등록에는 "시리얼 발번 요부" flag 가 없음 (시리얼은 결제 시점 발번이 신품 원칙). 중고는 매입 시점 발번이라 폼에 토글이 자연스러움.

발번 시 SerialItem 필드:
- `code`: 자동 발번 (`YYMMDD-NNNN`)
- `source`: USED_INTAKE
- `productId`: UsedItem.productId (있으면)
- `displayName`: UsedItem.displayName (productId 없으면)
- `customerId`: null (매입 시점)
- `orderItemId`: null
- `soldAt`: null (판매 전이라 비움)
- `status`: ACTIVE

### 10.2 발번 안 함 (부품 중고 / 조립 원료)

- 단품 판매 안 할 것으로 매장 직원이 판단
- 매입 시 시리얼 발번 OFF
- 조립에 흡수되면 그냥 UsedItem.status=ASSEMBLED_INTO 로 종결

### 10.3 판매 시 손님 정보 덮어쓰기

POS 결제 시:
- UsedItem.status = SOLD
- SerialItem.customerId/orderItemId/soldAt 자동 채움
- SerialItem.warrantyEnds 산정 (Product 보증 정책 또는 매장 기본값)

이후 손님이 `/s/[token]` 으로 보증/이력 조회 가능 (기존 SerialItem 흐름 그대로).

---

## 11. 작업 추정

### 11.1 모델·스키마

- `UsedItem` 모델 신규
- `UsedItemCost` 모델 신규
- `AssemblyUsedItemConsumption` 모델 신규
- `SerialItem` 수정 (soldAt nullable + USED_INTAKE source)
- `RentalAsset` 수정 (convertedUsedItemId)
- enum 추가 (`UsedItemSource`, `UsedItemStatus`, `UsedItemCostType`)

### 11.2 API

- `/api/used-items` (GET 목록, POST 생성)
- `/api/used-items/[id]` (GET, PUT, DELETE)
- `/api/used-items/[id]/costs` (POST, DELETE)
- `/api/used-items/[id]/issue-serial` (POST — 시리얼 발번)
- `/api/used-items/[id]/scrap` (POST — 폐기)
- `/api/rental-assets/[id]/convert-to-used` (POST — 임대 → 중고 전환)
- `/api/products/[id]/used-items` (GET — 카탈로그 매칭 UsedItem 조회, Product 상세 페이지용)

### 11.3 페이지

- `/inventory/used-items` (목록 + 필터)
- `/inventory/used-items/new` (매입 등록 폼)
- `/inventory/used-items/[id]` (상세 + 비용 가산 + 사진 업로드 + 상태 액션)
- `/inventory/used-items/reconcile` (EMERGENCY_USE 사후 정리 — 미정리 OrderItem + UsedItem 등록 폼 동시)

### 11.3a 신규 컴포넌트 (재사용 분리)

`src/components/used-items/` 디렉토리 신설:
- `used-item-form.tsx` — 매입 등록/수정 공용 폼 (new + reconcile 양쪽에서 사용)
- `used-item-card.tsx` — 단품 카드 (목록·상세에서 공용)
- `used-item-status-badge.tsx` — 상태 배지 (IN_STOCK / ASSEMBLED_INTO / SOLD / SCRAPPED)
- `used-item-search-combobox.tsx` — UsedItem 단독 검색 (필요 시 — 보통은 통합 검색에 흡수)
- `used-item-cost-list.tsx` — 비용 가산 카드 (PART / LABOR / OTHER)
- `used-item-image-upload.tsx` — 사진 업로드/삭제 (`imageUrls` 관리)

페이지 파일은 위 컴포넌트들 + jm 컴포넌트 조립만 — 800줄 넘지 않게.

### 11.4 기존 페이지 수정

- `/inventory/assembly` — UsedItem 자유 라인 영역 + 정형 lot 명시 선택 UI
- `/products/[id]` — "이 모델 중고 N대" 배지 + UsedItem 목록 링크
- `/pos` 상품 검색 — UsedItem 통합 (옵션 3 행 분리 + 배지)
- `/rental-assets/[id]` — "[중고로 전환]" 액션
- LandingSettings — 중고 노출 토글
- 견적서·명세표 검색 — 재고 있는 중고 노출 (판매 즉시 자동 숨김 — status 필터)
- 자사몰 (향후) — 동일한 매대 노출 정책

### 11.5 마진·재고

- OrderItem.unitCostSnapshot 산출 시 UsedItem 흡수 분기
- Assembly 결과 lot.unitCost 산출 시 UsedItem cost 합산
- 마진 리포트 — 거의 변경 없음 (LotConsumption + unitCostSnapshot 흐름 재활용)

### 11.6 추정 일정

| 단계 | 작업 | 상태 |
|---|---|---|
| Phase 1 | 모델·schema (UsedItem · UsedItemCost · AssemblyUsedItemConsumption · SerialItem 확장 · RentalAsset 핸드오프) + 기본 CRUD API + `src/components/used-items/*` 분리 컴포넌트 + `/inventory/used-items` 목록·매입 등록·상세 페이지 3개 + 사진 업로드 | ✅ 완료 |
| Phase 2 | Assembly 검색 API 에 UsedItem 통합 + 라벨 prefix + 선택 시 분기 처리 + 마진 계산 (AssemblyUsedItemConsumption → lot.unitCost 합산) + 폐기 시 자동 Expense 생성 | ✅ 완료 |
| Phase 3 | POS 검색 통합 (신품 우선 정렬 + `(중고)` prefix) + EMERGENCY_USE reconcile 페이지 | ✅ 완료 |
| Phase 4 | 임대 → 중고 전환 (RentalAsset.convertedUsedItemId + UI 액션) + 시리얼 발번 흐름 (UsedItem → SerialItem link + 판매 시 손님 정보 덮어쓰기) | ✅ 완료 |
| Phase 5 | 견적서·명세표 검색 통합 | ✅ 완료 |
| Phase 5 (보류) | 고객 랜딩 / 자사몰 중고 노출 | ⏸ 공개 storefront 그리드 부재 — 자사몰 구축 시점에 디자인과 함께 결정 |

**검증**: e2e 16/16 통과 (`e2e/used-items*.spec.ts` 5개 파일 — lifecycle·Assembly·POS·임대전환·문서). tsc 0 에러.

**컨벤션 준수 사항**:
- 모든 페이지·컴포넌트는 jm 디자인 시스템만 사용 (shadcn 금지)
- 페이지 파일 800줄 넘기지 않게 — `_types.ts` / `_helpers.ts` / `_parts.tsx` 또는 `src/components/used-items/*` 로 분리
- React Query + apiGet/apiMutate 패턴 준수 (CLAUDE.md §1)
- Prisma N+1 절대 금지 (CLAUDE.md §3)

---

## 12. 결정된 것 / 미정 항목

### 12.1 결정 완료

- ✅ 별도 도메인 분리 (`UsedItem` 모델, `/inventory/used-items` 페이지)
- ✅ UsedItem.productId link 지원 (카탈로그 매칭, 향후 확장성 확보)
- ✅ 시리얼 발번 — 매입 등록 폼에 체크박스 토글 + 기본값 자동 산정 (카탈로그 매칭이면 ON)
- ✅ 매대 노출 정책 — 4종 매대별 노출 여부 결정
- ✅ 공통 원칙 — "재고 있으면 노출, 판매되면 자동 숨김"
- ✅ POS 검색 — 그리드 카드 통합 + "중고" 배지 (행 분리 옵션 3은 폐기 — POS 가 그리드 필터링 방식이라 부적합)
- ✅ ERP 카탈로그 — 중고 노출 안 함 (`/inventory/used-items` 전용)
- ✅ 고객 랜딩 — 중고 노출
- ✅ 견적서·명세표 — 재고 있으면 노출, 판매 즉시 숨김
- ✅ VAT 처리 — `isAcquiredTaxable` 필드 추가 (기본 false, 사업자 매입 드문 케이스만 true). IncomingCost/SellingCost 의 isTaxable 패턴과 동일
- ✅ 매입 영수증 사진 — 보관 안 함 (필요 없음)
- ✅ 가격 책정 — 수동 입력 (POS/주문에서 가격 수정도 가능하므로 자동 산정 불필요)
- ✅ 보관 기간 알림 — 사용 안 함 (필요 없음)
- ✅ 보증 기간 — 시리얼 발번 시 매장 직원이 수동 입력 (Product 보증 정책 자동 적용 안 함)
- ✅ UsedItem 폐기(SCRAPPED) 시 비용 처리 — **자동 Expense 생성** (B2 옵션): `Expense` row 자동 추가 (category=INVENTORY_USAGE 또는 OTHER, amount=acquiredCost + Σ addedCosts). 영업이익에 자연 반영
- ✅ 보증 기간 0 처리 — `warrantyMonths = 0` 이면 `warrantyEnds = null` 저장 (= "보증 없음"). 현재 신품 시스템과 동일 정책 ([api/serial-items/issue/route.ts:185](src/app/api/serial-items/issue/route.ts#L185) 의 truthy/falsy 분기 그대로 활용)
- ✅ `/inventory/assembly` 구성품 선택 정책 — **A6: 구성품 드롭다운 검색에 IN_STOCK UsedItem 통합 + 라벨 `(중고)` 자동 prefix** (UI 변경 없음). 매장 직원이 검색 결과에서 직접 선택. 선택 시 분기:
   - 신품 Product 선택 → 기존 fifoConsume 흐름 그대로
   - UsedItem 선택 → 그 UsedItem 의 lot 차감 + `UsedItem.status = ASSEMBLED_INTO` + `AssemblyUsedItemConsumption` row 생성
   - UsedItem 은 1개 = lot 1개라 "lot 명시 선택" 이슈 자체 없음
   - 사용 후 자동으로 검색에서 사라짐 (status ≠ IN_STOCK)
   - 작업량: 백엔드 검색 API 확장 ~1일 + 프론트 라벨 prefix ~10분
- ✅ EMERGENCY_USE 사후 정리 — **(C) 자동 reconcile 페이지** `/inventory/used-items/reconcile`. 미정리 OrderItem (productId 없는 서비스 라인 중 매장 직원이 "중고였음" 표시한 것) 목록 + UsedItem 등록 폼 동시 표시 → 한 화면에서 link 완성. 미정리 항목 있으면 사이드바 메뉴에 카운트 배지
- ✅ POS 검색 정렬 — **(A) 신품 우선**. 손님 기대치 "보통 신품" 이라 신품을 검색 결과 위에 배치, 중고는 그 아래
- ✅ 자사몰 노출 디테일 (사진 필수? 시리얼 노출?) — Phase 5 로 미룸. 단 UsedItem 모델에 `imageUrls Json?` 필드 처음부터 포함 (§4.1) → `/inventory/used-items/[id]` 상세 페이지에서 사진 업로드/삭제 UI 제공
- ✅ **개발 컨벤션 (필수)**:
   - **jm 디자인 시스템 전용** — `JmButton`, `JmCard`, `JmTable`, `JmCombobox`, `JmDrawer`, `JmInput`, `JmFormField`, `JmStat`, `JmBadge` 등만 사용. shadcn `@/components/ui/*` import **금지** ([src/jm/DESIGN.md](src/jm/DESIGN.md) 참고)
   - **재사용 컴포넌트 우선** — 기존 jm 컴포넌트 (`JmCombobox`, `JmComboboxDrawer`, `SupplierCombobox` 등) 가 있으면 그대로 활용
   - **신규 중고 컴포넌트도 재사용 가능하게 분리** — `src/components/used-items/` 디렉토리 신설. UsedItemForm, UsedItemSearchCombobox, UsedItemCard, UsedItemStatusBadge, UsedItemCostList 등 단위 컴포넌트로 쪼개서 페이지에 import. 페이지 파일 800줄 넘기지 않도록 (CLAUDE.md §2 "큰 파일 분리" 원칙 준수)
   - **shared 패턴 활용** — `_types.ts` / `_helpers.ts` / `_parts.tsx` 분리 (CLAUDE.md §2 라우트 폴더 패턴)

### 12.2 추가 검토 필요

_(현재 결정 대기 항목 없음. 자사몰 노출 디테일은 Phase 5 시점에 검토)_

### 12.3 향후 확장 가능성 (이번 작업 범위 밖)

- 중고 위탁 판매 (매장이 손님 물건 보관 후 판매 성공 시 정산)
- UsedItem 카테고리 자동 분류 (이미지 기반 ML)
- 자사몰 중고 listing 자동 동기화

---

## 13. 참고 — 다른 시스템 패턴

| 시스템 | 핵심 패턴 | 우리 설계와의 매핑 |
|---|---|---|
| SAP / Oracle / Dynamics | Item Master 1개 + Serial 단품 추적 + condition 차원 | UsedItem.productId link + 시리얼 발번 |
| 중고차 딜러 (Reynolds, CDK) | StockUnit 별도 모델 (VIN PK), Catalog ≠ Inventory | UsedItem 전용 도메인 |
| 전당포 | PawnTicket 평행 모델, 판매 시 변환 | UsedItem → SerialItem 발번 |
| Reverb / Lightspeed | Model = 카탈로그, Listing = 인스턴스 | Product = 카탈로그, UsedItem = 인스턴스 |
| Antique 매장 | One-of-a-kind 모드, 각 아이템 1수량 lifecycle | UsedItem.status lifecycle |

---

## 14. 다음 액션 (구현 완료 후 남은 것)

Phase 1~5 구현 완료. 남은 항목은 전부 **보류 / 향후 확장**:

1. **자사몰·고객 랜딩 중고 노출** — 공개 상품 그리드(storefront)가 아직 없어 보류. 자사몰 구축 시 함께 결정 (사진 필수 여부 / 시리얼 공개 정책 등)
2. **§12.3 향후 확장** — 중고 위탁 판매, 이미지 기반 카테고리 자동 분류, 자사몰 listing 자동 동기화
3. **운영 후 피드백 반영** — 매장에서 실제 운용하며 발견되는 UX/정책 조정 (예: 매대 검색 정렬 우선순위 미세조정, EMERGENCY_USE reconcile 진입 동선)

