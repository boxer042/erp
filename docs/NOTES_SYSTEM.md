# 업무 노트 (Business Notes) 시스템 설계

> 통합 메모/할일 허브. 사장(ADMIN) 본인이 일하며 남기는 할일·메모를 한곳에서 관리하고,
> 마감 리마인더를 카카오톡으로 받는다. 대시보드 위젯 + 전용 페이지(`/notes`)로 노출.
>
> **상태**: 설계 확정 (2026-05-31). Phase 0 미착수. 사전 정리로 죽은 메모 필드 3종 제거 완료.
> **모델명**: Prisma `Note` / UI·메뉴 라벨 "업무 노트" / 라우트 `(dashboard)/notes`.

---

## 1. 목적과 배경

기존 메모는 30여 개 모델에 단일 `memo` 컬럼으로 흩어져 있어(중구난방) 작성자·작성시각 추적도,
체크(완료)도, 알림도 없다. 유일하게 타임라인 구조인 것은 `CustomerNote`뿐이다.

"업무 노트"는 이 흩어진 메모를 정리하고, **(1) 내가 직접 남기는 할일/메모**와
**(2) 운영(주문·입고·수리 등) 중 남긴 내부 메모**를 한 허브에서 보고, 체크하고, 알림 받게 한다.

충족할 요구사항:
1. 이름은 "업무 노트" (todolist 아님).
2. 메모 작성 시 **체크 여부(할일/메모)**와 **알림 여부**를 선택.
3. 단순 메모 + 운영 중 남긴 메모도 여기서 함께 확인.
4. todo형 메모와 단순 메모를 구분.
5. 직접 생성한 메모와 입고·주문 등에서 남긴 메모의 **출처를 추적**하고 모달로 원본 열람.

---

## 2. 메모의 3종 구분 (설계의 핵심 통찰)

36개 메모/사유 필드를 감사한 결과, "메모"는 사실 성격이 다른 3종이다. 이를 섞으면 인쇄가 깨진다.

| 종류 | 정의 | 처리 |
|---|---|---|
| **내부 작업 메모/할일** | 내가 보려고 적는 것. 체크·알림·출처추적 대상 | **업무 노트(`Note` 타임라인)로 통합** |
| **문서 비고(대표 비고)** | 영수증·명세표·발주서·견적서·수리내역서에 인쇄되어 상대방이 보는 문서 필드 | **엔티티 컬럼 유지** (인쇄 전용, 허브와 별개) |
| **사유 / 시스템 / 마스터 텍스트** | enum 부연(취소사유 등), 시스템 자동 감사 텍스트, 설정 마스터 메모 | **손대지 않음** |

---

## 3. 데이터 모델

단일 `Note` 모델 — 1:N, 폴리모픽 출처 링크. `CustomerNote` 패턴을 일반화.

```prisma
model Note {
  id          String        @id @default(uuid())
  kind        NoteKind      @default(MEMO)   // TODO(체크 가능) | MEMO(단순)
  content     String                          // 본문
  title       String?

  // 할일(체크) 축 — kind=TODO 일 때만 의미
  done        Boolean       @default(false)
  doneAt      DateTime?     @map("done_at")
  dueDate     DateTime?     @map("due_date")
  priority    NotePriority  @default(NORMAL)

  // 알림 축
  notify      Boolean       @default(false)
  notifyAt    DateTime?     @map("notify_at")
  notifiedAt  DateTime?     @map("notified_at")

  // 출처 추적 축 (요구사항 5) — 폴리모픽, 선택. null = 직접 작성
  sourceType  NoteSourceType?  @map("source_type")
  sourceId    String?          @map("source_id")
  sourceLabel String?          @map("source_label")  // 예: "ORD260531-0001" 스냅샷

  pinned      Boolean       @default(false)
  createdById String        @map("created_by_id")
  createdBy   User          @relation(fields: [createdById], references: [id])
  isActive    Boolean       @default(true) @map("is_active")   // soft delete
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@index([isActive, done, createdAt])
  @@index([sourceType, sourceId])
  @@index([notify, notifyAt, notifiedAt])
  @@index([createdById])
  @@map("notes")
}

enum NoteKind { TODO MEMO }
enum NotePriority { LOW NORMAL HIGH }
enum NoteSourceType { ORDER INCOMING PURCHASE_ORDER REPAIR CUSTOMER SUPPLIER PAYMENT GENERAL }
```

요구사항 매핑: `kind` = 체크 여부(2·4), `notify`/`notifyAt` = 알림 여부(2), `sourceType`/`sourceId`/`sourceLabel` = 출처 추적(5).

---

## 4. 메모 필드 통합 정책 (36개 감사 결과)

### A. 업무 노트로 통합 (내부 작업 메모 → `Note` 타임라인)
`Order.memo`* · `Incoming.memo` · `PurchaseOrder.memo`* · `RepairTicket.repairNotes`* ·
`Customer.memo` · `Supplier.memo` · `SupplierPayment.memo` · `CustomerPayment.memo` · `CustomerNote`(이미 타임라인 → 흡수)
- `*` = 인쇄도 되는 항목 → 아래 5번 "대표 비고" 규칙 적용 (컬럼 유지 + 타임라인 별도 추가).

### B. 유지 — 통합도 제거도 안 함
- **문서 비고**(상대방용 인쇄): `Quotation.memo`, `Statement.memo`, `PurchaseOrder.shippingMemo`(거래처가 외부에서 입력)
- **사유 필드**(enum 부연): `Order.returnReason`, `RepairTicket.cancelMemo`, `RepairTicket.quoteRejectMemo`, `ProductPriceHistory.reason`, `SupplierProductPriceHistory.reason`, `PendingChannelOrder.reason`
- **마스터/설정 메모**: `Product`, `Brand`, `SalesChannel`, `SupplierProduct`, `CustomerMachine`, `UsedItem`, `SerialItem`, `RentalAsset`, `IncomingItem`, `RepairLaborPreset`, `RepairPackage`, `ServiceFeePreset`
- **시스템 감사 텍스트**: `InventoryMovement.memo` (시스템 자동 생성 — 손대면 재고 이력 표시 깨짐)

### C. 제거 완료 (죽은 필드 — 입력·표시 어디에도 없음)
- `OrderItem.memo` — 스키마에만 존재, 입력 UI 없음, API 미수신, PDF는 `memo: null` 하드코딩
- `RepairTicket.memo` — QR 셀프접수 라우트가 쓰기만 하고 어디서도 표시 안 됨(write-only). 실제 메모는 `repairNotes`
- `SupplierContact.memo` — API는 받지만 담당자 입력/표시 UI 없음
- 처리: 스키마 + 검증기(`repair-ticket.ts`, `supplier.ts`) + 라우트(`repair-tickets`, `suppliers`, `public/serial-access/.../repair-request`)에서 제거 → `prisma db push`. tsc 0.

---

## 5. 대표 비고 vs 타임라인 (인쇄 충돌 해법)

`Order.memo`·`PurchaseOrder.memo`·`RepairTicket.repairNotes`는 내부 메모이면서 동시에 **인쇄**된다.
"여러 개·타임라인"으로 바꾸면 "어느 노트가 인쇄되나?" 문제가 생긴다. 해법:

- **인쇄되는 엔티티(주문·발주·수리)**: 기존 컬럼을 "**대표 비고**"로 **유지**(인쇄 경로 변경 없음).
  내부 메모/할일은 `Note` 타임라인으로 **별도** 추가. 인쇄는 대표 비고만 읽는다.
- **순수 내부 메모(고객·거래처·입고·결제)**: 기존 컬럼 값을 `Note`로 **백필** 후 입력 UI를
  타임라인으로 전환, 컬럼 **제거**.

---

## 6. UI

- **전용 페이지** `(dashboard)/notes` — jm 리스트 패턴(`flex min-h-full ... p-4`).
  탭(전체/할일/완료/메모/출처별) · 필터(우선순위·도메인) · 검색 · `+ 추가`.
  행: 체크박스(완료) · 본문 · 출처 배지(클릭→모달) · 마감일 · 알림 아이콘 · 우선순위 · 수정/삭제.
  `+ 추가` → `JmDrawer` 폼: 본문(`JmTextarea`) · 할일/메모(`JmSegmentedControl`) · 알림 토글(+마감일) · 우선순위.
  **출처 모달**(요구사항 5): 원본 메모 전문 + 메타 + "원본으로 이동" 딥링크.
- **대시보드 위젯** `(home)/_todo-memos.tsx` (`"use client"`) — 미완료 할일 Top N(마감·우선순위순) +
  인라인 체크박스. 서버 `page.tsx` Promise.all 에 쿼리 추가 → 위젯에 전달(기존 `_clickable-stat.tsx` 분리 패턴).
- **엔티티 상세**: 주문/입고/수리/고객/거래처/결제 상세에 sourceType별 노트 타임라인 카드.
- jm 컴포넌트 전부 기존재 — 신규 컴포넌트 불필요.

---

## 7. 알림 — 카카오 "나에게 보내기" (Phase 3)

사장 본인 리마인더는 **카카오 알림톡(Solapi)이 아니라** 카카오톡 메시지 API "나에게 보내기"로 구현.
(확인: developers.kakao.com 공식 문서 + 카카오 staff 답변, 2026-05-31 기준)

- 엔드포인트 `POST https://kapi.kakao.com/v2/api/talk/memo/default/send`, `object_type: text`(자유 텍스트).
- **무료 / 사전 승인 템플릿 불필요 / 비즈앱 전환·검수 불필요** (나에게 보내기는 별도 권한 불필요).
- 인증: 카카오 로그인 OAuth + `talk_message` 동의 1회 → refresh token 저장. **전화번호(User.phone) 불필요.**
- 운영 주의: refresh token **2달 만료**. cron이 만료 1개월 이내 구간에서 갱신해 회전시켜야 함(놓치면 재로그인).
- 기존 Solapi 알림톡 인프라(`src/lib/notifications/`)는 **고객 외부 알림 전용**으로 유지 — 목적·대상이 달라 충돌 없음.
- 신규 필요: 카카오 토큰 저장(User 필드 또는 별도 모델) · `NotificationKind`에 `TODO_REMINDER` ·
  `/api/cron/todo-reminders`(notifyAt 도래 + 미완료 → 발송, notifiedAt 기록) · 토큰 회전 cron.

---

## 8. 단계별 빌드 로드맵

| Phase | 내용 | 위험 |
|---|---|---|
| **0 (완료)** | `Note` 모델+enums, `/api/notes` CRUD, `query-keys`, validators, `/notes` 페이지, 대시보드 위젯 | 무위험(순수 추가) |
| **1 (대부분 완료)** | 재사용 `NoteTimeline` + 주문·발주·수리·거래처·고객 상세에 타임라인(대표 비고 유지) + 백필 스크립트 + 출처별 탭 + 고객 `CustomerNote` 흡수. 입고·결제 live wiring만 남음 | 중 (읽기·인쇄 경로 검증) |
| **2 (부분 완료)** | 死코드 제거 완료(`CustomerNote` 모델 · `/api/customer-notes`). 단일 memo 컬럼은 대표 비고로 유지 결정 → 추가 드롭 없음 | 중 |
| **3 (연동 실증 완료)** | 카카오 나에게 보내기 클라이언트 + OAuth 연결 + 토큰 회전 cron + 리마인더. **localhost 실발송 검증 완료** | 중 (외부 OAuth) |

---

## 9. 완료 / 후속 검증 항목

**완료 (2026-05-31)**:
- 죽은 메모 필드 3종 제거(§4-C) — 스키마+검증기+라우트+`db push`, tsc 0.
- **Phase 0** — `Note` 모델/enums + `User.notes` 관계, `/api/notes` + `/api/notes/[id]` CRUD, 검증기 `src/lib/validators/note.ts`, `queryKeys.notes`, 전용 페이지 `(dashboard)/notes`(탭 전체·할일·완료·메모 + 검색 + 작성/수정 드로어 + 삭제 확인 + 출처 모달), 대시보드 위젯 `(home)/_todo-memos.tsx`(미완료 할 일 Top 6 + 인라인 완료), 사이드바 "업무 노트" 메뉴. tsc 0 / eslint 0 / 적대적 리뷰 0 confirmed. 알림 발송은 Phase 3, 출처(sourceType) 통합은 Phase 1.
  - 미검증: 인증 세션이 필요해 로컬 런타임(브라우저) 스모크는 미실시 — 정적 검증(tsc/eslint/리뷰) + 기존 패턴 미러링으로 갈음.
- **Phase 1 (진행 중)** — 재사용 `NoteTimeline` 컴포넌트(`src/components/note-timeline.tsx`, source 스코프 조회 + 추가/완료토글/삭제, IME-safe) + 공유 타입 `@/lib/notes`(+ `notes/_types.ts` 재노출 shim). **주문·수리·발주·거래처** 상세에 "메모·할 일" 타임라인 카드 추가 — 순수 additive(대표 비고 미변경). 거기서 남긴 노트는 `sourceType`/`sourceId`/`sourceLabel`(주문=id/orderNo, 수리=ticket id/ticketNo, 발주=id/poNo, 거래처=id/name)로 허브에 모임. tsc 0 / eslint 0(신규) / 적대적 리뷰 0 confirmed(주문·수리·발주분).
  - **백필 스크립트** `scripts/backfill-notes.ts` — 기존 인라인 메모(고객·거래처·입고·공급결제·수금) → source 연결 `Note` 복사. 멱등(동일 source+content 건너뜀)·dry-run 기본. **`--commit` 실행 완료** (dev DB 2건 생성: 입고·결제). 재실행 시 중복 건너뜀.
  - **허브 "출처별 메모" 탭** — `/api/notes?hasSource=1`(sourceType≠null 필터) + `/notes` 탭 추가. source 연결 노트(타임라인·백필분)를 한곳에서 출처 배지·원본 모달과 함께 조회 → 요구사항 3 충족.
  - **고객 `CustomerNote`→`Note` 흡수 완료** — 고객 상세 노트 탭을 `NoteTimeline`(sourceType=CUSTOMER)으로 교체 + `/api/customers/[id]/detail` 의 notes 쿼리를 `Note` 로 전환 + 백필(개별 `create` 로 createdAt·createdById 보존). `/api/customer-notes`(GET/POST/DELETE)·`CustomerNote` 모델은 **프론트 호출처 0 = 死코드** → Phase 2 제거.
  - **입고 live wiring 완료** — 입고 상세(인라인 명세표 뷰, `inventory/incoming/page.tsx`)의 "입고 정보" 아래 "메모·할 일" 박스 추가 (sourceType=INCOMING, `detail.id`/`incomingNo`).
  - **결제는 별도 live wiring 안 함** — 전용 상세 뷰가 없고(다이얼로그+원장 줄), 결제 맥락의 노트는 해당 **거래처/고객 타임라인**(이미 wiring됨)으로 커버. 기존 결제 memo 는 백필로 허브 노출. 필요 시 추후 거래처원장 내 결제 모달에 추가 가능.
- **Phase 2 (부분 완료, 2026-05-31)** — 死코드 제거: `CustomerNote` 모델·관계(User/Customer)·`/api/customer-notes`(GET/POST/DELETE) 삭제 + `db push`(빈 `customer_notes` 테이블 drop). 고객 노트는 `Note`(sourceType=CUSTOMER)로 일원화. tsc 0.
  - **결정**: 단일 `memo` 컬럼(고객·거래처·입고·결제 등)은 전 도메인에서 **대표 비고로 유지**(컬럼 드롭/입력 마이그레이션 안 함 — 리스크 대비 이득 낮음). `NoteTimeline` 은 그 위 추적 노트/할일 레이어(additive). `CustomerNote` 만 별도 중복 시스템이라 흡수·제거함.
  - **⚠️ prod 주의**: 운영 DB `customer_notes` 에 데이터가 있으면 `npm run db:push:prod` 전에 백필(`npx tsx --env-file=.env.prod scripts/backfill-notes.ts --commit`)을 먼저 실행해 `Note` 로 이관할 것. (dev 는 0건이라 바로 drop.)
- **Phase 3 (스캐폴드 완료, 2026-05-31)** — 카카오 "나에게 보내기" 리마인더 인프라. **env-gated** — `KAKAO_REST_API_KEY`+`NEXT_PUBLIC_APP_URL` 미설정이면 전 경로 no-op(연결 버튼 숨김·cron "미설정" 반환). tsc 0 / eslint 0 / 적대적 리뷰(2렌즈) 0 confirmed.
  - `KakaoConnection` 모델(userId별 access/refresh 토큰+만료) · `src/lib/notifications/kakao-memo.ts`(authorize/exchange/refresh+회전/getValidAccessToken/sendMemoText) · `/api/kakao/{connect,callback,status}` · `/api/cron/todo-reminders`(due 노트 발송+notifiedAt 마킹 + keep-alive 토큰 회전) · `/notes` 헤더 "카카오 알림 연결" 버튼(`_kakao-connect.tsx`).
  - **활성화 절차**: ① developers.kakao.com 앱 생성 → REST API 키 ② 카카오 로그인 활성화 + 동의항목 "카카오톡 메시지 전송"(`talk_message`) ③ Redirect URI 등록 `<NEXT_PUBLIC_APP_URL>/api/kakao/callback` ④ env: `KAKAO_REST_API_KEY`,`KAKAO_CLIENT_SECRET`(선택),`NEXT_PUBLIC_APP_URL`,`CRON_TOKEN` ⑤ `/notes` 에서 "카카오 알림 연결" 1회 클릭(OAuth) ⑥ 스케줄러가 `/api/cron/todo-reminders?token=<CRON_TOKEN>` 를 매일(또는 시간별) 호출.
  - **실증 완료 (2026-05-31, localhost)**: 카카오 개발자 앱 생성 → 카카오 로그인 ON + `talk_message` 동의 → Redirect URI(`[앱]>[플랫폼 키]>[REST API 키]>[리다이렉트 URI]`, 콘솔 개편으로 위치 이동) 등록 → Client Secret 사용 → `.env.local` 설정 → `/notes` 연결(OAuth) → cron 호출 → **카카오톡 "나와의 채팅" 실제 도착 확인(`sent:1`)**. 전 경로 작동.
  - **연동 중 수정**: ① 미들웨어가 `/api/cron` 미허용 → 세션 없는 cron 이 `/login` 으로 막힘 → `src/lib/supabase/middleware.ts` 화이트리스트에 `/api/cron` 추가(기존 cron 들도 해결). ② Client Secret 활성화 앱은 토큰 교환에 `KAKAO_CLIENT_SECRET` 필수(없으면 KOE010).
  - **localhost 한계**: 메시지의 "자세히 보기" 링크가 `http://localhost:3000/notes` 라 폰에서 안 열림. **운영 도메인으로 `NEXT_PUBLIC_APP_URL` 설정 시 정상**.
  - refresh token 2달 만료는 cron keep-alive 가 회전 유지(만료 1개월 이내 갱신 시 새 토큰 발급) — cron 이 2달 이상 끊기면 재로그인 필요.
  - **자동발송**: 스케줄러(EasyCron/Vercel Cron/crontab)가 `GET /api/cron/todo-reminders?token=<CRON_TOKEN>` 를 주기 호출(리마인더 시각 정밀도 위해 10~30분 또는 매시 권장).
  - **알려진 한계(낮음)**: PENDING 주문 하드삭제 시 연결 노트가 고아로 남음(표시 안 됨·무해). Phase 2 정리 때 cleanup 고려.

**Phase 1 착수 전 검증**:
- `SupplierPayment.memo`/`CustomerPayment.memo` 는 ledger description 생성에 사용됨 → 타임라인 전환 시 description 이 노트를 읽도록 처리 필요.
- `Incoming.memo` 가 입고 거래명세표(`supplier-items-pdf`)에 인쇄되는지 확인 후 통합/대표비고 결정.
