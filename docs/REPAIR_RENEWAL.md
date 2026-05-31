# 수리 진행 페이지 리뉴얼 — 설계 (WIP)

> 살아있는 설계 문서. 논의하며 계속 갱신. 확정 전이므로 구현 근거로 쓰기 전 "결정 로그" 확인.

## 0. 목표 / 원칙

POS **수리 진행 페이지를 완전히 재구축**한다. 세 원칙:

1. **속도** — 작업하며 빠르게 탭하는 게 본질. 화면이 즉각 반응해야 함.
2. **데이터 안전성** — 매 동작 즉시 영속(앱 닫혀도 안 날아감) + 재고·회계 정합성.
3. **통합 UX** — 상품·임대와 같은 통일 헤더/흐름. 중복 페이지 제거.

---

## 1. 현재 구조 (파악 결과)

### 1.1 라우트
| 라우트 | 역할 | 리뉴얼 후 |
|---|---|---|
| `/pos/repairs` | 수리관리 — 6섹션 리스트 | 유지 |
| `/pos/repairs/[id]` | **standalone** 진행 페이지 | **제거** → customer 페이지로 |
| `/pos/customer/[sid]?mode=repair` | 손님 작업 페이지 수리 모드 | **단일 진행 화면**으로 승격 |
| `/repairs/templates` | 증상/진단 템플릿 관리 (숨겨짐·링크 없음) | **진입점 노출** |
| `/repair/approve/[token]` | 손님 수리 승인 (맡김) | 유지 (라벨만 동기) |

### 1.2 RepairDetail — 이미 공유 컴포넌트
`repairs/[id]/page.tsx` 의 `RepairDetail` 하나를 standalone·customer 양쪽이 props로 분기 재사용:
- `hideHeader` — 헤더를 부모가 그릴지 (customer=true)
- `onAddToCart` — 있으면 카트 결제(customer), 없으면 자체 PickupSheet(standalone)

→ **본문은 안 갈라져 있음.** 통합 = standalone wrapper(자체 헤더 + PickupSheet) 흡수, `hideHeader`/카트 단일화.

### 1.3 본문 카드 (~11개, 세로 스크롤)
CustomerDeviceCard · ProductLinkCard(기기 4모드: 시리얼/구매이력/카탈로그/직접) · DiagnosisFeeCard(진단비+보증) · SymptomCard(증상) · **DiagnosisCard(진단→"진단 및 수리내용")** · NotesCard(메모) · PackagesCard(패키지 빠른추가) · SetRecommendations(세트) · PartsSection(부속+추천칩) · LaborsSection(공임+추천칩) · ReferenceInfoSection(시리얼이력+재수리, collapsible)

### 1.4 스마트 추천 엔진 (핵심 가치)
```
기기→카테고리 → 증상 → 진단(=수리내용) → 부속/공임 추천칩(1클릭) → 세트(묶음 1클릭)
                linkCount        occurrenceCount            정확일치 학습(Phase4)
```
- 모델: `RepairSymptomTemplate` · `RepairDiagnosisTemplate` · `SymptomDiagnosisLink`(증상↔진단) · `DiagnosisPartUsage`(진단→부속 빈도) · `DiagnosisPartSet`(진단→세트)
- 자유 입력이 템플릿으로 자동 정규화 + occurrenceCount 누적

### 1.5 상태 전이 + 안전장치
```
RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP
   ON_SITE 는 RECEIVED→REPAIRING 직행 / 어디서든 CANCELLED
   reject_after_quote(진단비만 청구): DROP_OFF=DIAGNOSING·QUOTED, ON_SITE=REPAIRING → READY
```
모든 전이는 `/api/repair-tickets/[id]/transition` 집중. 푸터 = 합계 + 다음단계 버튼(`nextActions`).

### 1.6 데이터 저장 방식 — **현재의 병목**
- 증상·진단·부속·공임 = **입력/클릭마다 즉시 개별 API 저장** (메모만 onBlur)
- 그러나 **낙관적 업데이트 없음** + 성공 후 **티켓 전체 invalidate→refetch** + **debounce 없음**
- → 탭 1회 = 쓰기 + 전체 재조회 2 왕복 후 반영. 빠르게 칠수록 느려짐.

---

## 2. 반드시 보존할 핵심 정체성 (UI 바뀌어도 사수)

1. **스마트 추천 엔진** — 증상→진단→부속/공임→세트 1클릭. 없으면 입력 속도 붕괴.
2. **4모드 기기 식별** — 시리얼/구매이력/카탈로그/직접 (중고·외부기기 현실).
3. **진단비 자동 면제** — 부속·공임 있으면 0, 수리 안 하면 청구.
4. **재고 정합성** — 부속 추가=즉시 FIFO 차감 / 취소=USED FIFO 역순 복원 / LOST 유지.
5. **hard·soft delete 판정** — 미등록+시리얼없음+LOST없음+진단비0+SOLD_AS_PRODUCT아님 → 완전삭제, 아니면 기록 보존.
6. **reject_after_quote 가드** — 부속·공임 있으면 차단(취소로 유도). 진단비만 청구.
7. **pickup 서버 재계산** — `calcRepairTotals` 로 finalAmount 재산출 (클라 금액 불신).
8. **ON_SITE/DROP_OFF 비대칭** — 즉시=직행, 맡김=진단·견적·승인 강제.
9. **손님 승인 페이지(맡김)** — 증상·진단(수리내용)·부속·공임·총액을 손님이 보고 승인.

---

## 3. 확정된 설계 결정 (결정 로그)

| # | 결정 | 근거 | 영향 |
|---|---|---|---|
| D1 | **standalone 라우트 제거 → customer 페이지로 통합** | 본문 이미 공유, standalone 고유가치 거의 없음 | `/pos/repairs/[id]` 제거(또는 redirect), PickupSheet 제거, 헤더 단일화, 결제 카트 단일화 |
| D2 | **데이터 계층: optimistic + 부분 patch + debounce** | 속도↑·egress↓·영속성 유지. Supabase 건당 과금 없음(Realtime 미사용·Prisma 직결) | 매 동작 setQueryData 로 즉시 반영, 전체 refetch 제거, 수량·단가 debounce |
| D3 | **라벨 `진단` → `진단 및 수리내용`** (압축형 `진단·수리내용` 가능) | 운영 데이터 실측 — 전부 "조치/수리내용"(기화기 수리·패킹 교체…), 순수 원인 0건. 손님 승인 화면에도 더 정확 | UI 라벨만(POS 카드·손님 승인·템플릿 탭). **DB·엔진 불변** |
| D4 | **템플릿 관리 진입점 노출** | `/repairs/templates` 이미 존재하나 링크 없음(숨은 페이지) | 사이드바/수리 페이지에 진입점 추가 |
| D5 | **템플릿 병합 기능 추가** (이번 스코프) | "기화기 문제로 수리"≈"기화기 수리" 파편화. 코드가 이미 "병합이 필요합니다" 에러로 인지하나 기능 없음 | 대표 선택→티켓·링크·부속빈도·세트 재배치 + 카운트 합산 + 중복 삭제. 추천 엔진 강화. `/repairs/templates` 에 다중선택→대표지정 UI |
| D6 | **IA: 단일 페이지 유지** (상태기반 staged 아님) | 과거 staged(단계별 페이지 분할) 시도 → **"조작 과다"로 단일 페이지 회귀**. 이미 검증된 회피 방향 | 카드 정리·접힘·clunk 제거·**탭 수 줄이기**는 하되, 단계별 페이지 분할은 안 함. staged 마이그레이션은 차후 |
| D7 | **입력 = 가로스크롤 카드 (넷플릭스식)** — [+직접추가]가 맨 앞, 나머지는 추천 데이터 1탭, 검색은 끝 [🔍] | 드로워 열고-검색 마찰을 흔한 경우 0으로. 추천 엔진을 숨기지 않고 전면화 | 부속/공임=**정사각 멀티추가**(이미지+이름+가격), 증상/진단=**가로 긴 칩 단일선택**(문장). 순서는 추천 엔진(occurrenceCount·증상매칭). 롱테일은 끝 [🔍]=기존 드로워 |
| D8 | **부속 자유부속 허용 → 선판매(/presale) 연동** (Q2 활성화) | 부속 [+직접추가] = 미등록 부속. 손님 청구는 즉시, 원가는 /presale 허브에서 사후 정산 | `RepairPart` 스키마: productId nullable + name + presaleKind 마커 / 자유부속 FIFO 미차감 / `/presale` reconcile 를 RepairPart 까지 확장 / UsedItem↔RepairPart 링크 + 소비상태. **허브는 '선판매' 유지 + 탭 없이 유형(판매/수리사용) 컬럼으로 한 리스트** |
| D9 | **헤더 = 기존 통일 헤더 + 가운데 진행 stepper** | 상품/임대와 헤더 골격 동일, 수리 모드만 가운데가 stepper | 별도 줄 X. 좌=상태칩+번호, 중앙=stepper, 우=고객 |
| D10 | **선판매 허브 표시 + 직접추가 모달 규격 칸** | 한눈 파악 + 정확한 청구가 | 허브: 품명 다음 **규격 컬럼**, 금액 **VAT 포함**. 직접추가 모달 = 이름+**규격(선택)**+가격 (재화류만; 공임·서비스는 칸 없음). 적용: 수리 부속 모달 + 기존 PresaleSheet |
| D11 | **자유 텍스트 정규화 인프라** (이번 스코프) — 증상·진단·기기 직접입력 공유 | 같은 패턴: 자유입력→정규화 누적→병합→카탈로그 매핑(Option B 명칭 따라감) | 기기 템플릿 저장 + 병합·**카탈로그 매핑 UI 모두 이번 스코프** (D5와 통합). 정규화(공백·하이픈·대소문자) 자동매칭 + 수동 병합. "에코 420es≈에코 420-es" 중복 방지. 매핑 시 내상품명 사용 |

### 운영 데이터 근거 (D3, 2026-05 실측 4건)
- 증상: "엔진톱 시동 유지안됨", "물 안나옴", "시동 안걸림" → 진짜 증상 ✅
- "진단" 칸: "기화기 수리 및 프라이머벌브 교체", "패킹교체 및 체크밸브세척", "기화기 수리", "기화기 문제로 수리" → **전부 부위+동작(조치)**

---

## 4. 논의 중 / 미정

- **IA 방향 확정(D6)**: 단일 페이지 유지. 남은 질문은 *"단일 페이지 안에서 조작(탭)을 어떻게 더 줄이나"* — staged 로 안 가는 대신 **인터랙션 수를 깎는 게 핵심**
- 라벨 최종형: `진단 및 수리내용` vs 압축 `진단·수리내용`
- 맡김 승인 때 "원인"을 따로 보여줄 케이스가 실제 있나 (있으면 선택적 원인 한 줄)
- 병합 UI 상세 (관리 페이지에서 다중선택→대표지정?)
- **조작 줄이기 후보** (미시 clunk): 부속 LOST 토글 / 공임 hours 고정 / PriceInputDialog 단가·합계 중복 / 추천 칩 라벨 / 카드 접힘 기본값

---

## 5. 변경 영향 — 데이터/API 참조

- **티켓 본문 read/write**: `/api/repair-tickets/[id]` (GET/PUT), `/parts`·`/labors` (POST/PATCH/DELETE), `/transition` (상태)
- **추천**: `/api/repair-diagnosis-templates/[id]/recommendations` ({parts, labors, sets})
- **템플릿**: `/api/repair-symptom-templates`, `/api/repair-diagnosis-templates` (+ `/[id]` 편집·삭제)
- **병합 시 재배치 대상**: `RepairTicket.{symptom|diagnosis}TemplateId`(SetNull) · `SymptomDiagnosisLink` · `DiagnosisPartUsage`(Cascade) · `DiagnosisPartSet`(Cascade) · `usageCount`
- **스키마 변경 필요** (dev+prod push):
  - `RepairPart`: `productId` nullable + `name` + `spec` + `presaleKind` 마커 (자유부속, D8/D10)
  - 기기 자유입력용 **`RepairDeviceTemplate`** 신규 (증상/진단 템플릿과 동형) + `RepairTicket.repairDeviceTemplateId` (D11)
  - `RepairDeviceTemplate.productId` 등 카탈로그 매핑 FK (D11) · `UsedItem↔RepairPart` 링크 (D8)
- 라벨(D3)·optimistic(D2)·헤더(D9)·가로카드 UI(D7)는 스키마 무관.

---

## 6. 구현 단계 (Phase)

전체가 크므로 의존성 순서로 분할 — 단계별 검증·커밋.

| Phase | 내용 | 결정 | 스키마 |
|---|---|---|---|
| **A. 라벨** ✅완료 | 라벨 `진단·수리내용` (진단카드·손님승인·템플릿탭 3곳) | D3 | X |
| **B. 페이지 재구축 + optimistic** | standalone 제거→customer 통합 · 통일헤더+stepper · 가로카드 입력(부속/공임 정사각, 증상/진단 칩) · [+직접추가] 모달 · [🔍] 검색 · **optimistic 데이터훅(+debounce)** — 새 카드에 처음부터 박음 | D1·D2·D7·D9 | X |
| **C. 자유부속 + 선판매** | RepairPart 자유부속(스키마) · FIFO 미차감 · `/presale` RepairPart 확장 · 허브 표시(규격·VAT·유형컬럼) · 직접추가/PresaleSheet 규격칸 | D8·D10 | ✅ RepairPart |
| **D. 템플릿 정규화·병합·매핑** | 기기 템플릿 · 병합 UI(증상/진단/기기) · 카탈로그 매핑(Option B) · 템플릿 페이지 진입점 | D4·D5·D11 | ✅ DeviceTemplate |

- A·B 는 저위험·즉효(스키마 X). C·D 는 스키마 push 동반.
- 단계 간 독립성 높아 순서 조정 가능 (단 A→B 권장: optimistic 패턴을 B 카드가 재사용).
