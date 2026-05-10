# 시드 데이터 테스트 가이드

생성일자: **2026-05-07**
DB: `postgresql://postgres.kzpvbhdroxwgkwjsmeuy:***@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
관리자 계정: **uchan01227@gmail.com**

> 이 문서는 `prisma/seed.ts` 가 자동 생성한 가이드입니다. 인쇄해서 옆에 두고 시나리오별로 UI 에서 확인해보세요.

---

## ⚠ 로그인

`uchan01227@gmail.com` 계정으로 Supabase 에 가입한 그 비밀번호로 ERP 에 로그인 (User 테이블에 ADMIN 행이 박혀있으니 자동 매칭됨).

---

## 자동 검증 결과

| 검증 항목 | 결과 |
| --- | --- |
| Inventory.quantity == Σ InventoryLot.remainingQty | ✅ 69개 상품 통과 |
| CustomerLedger 잔액 누적 정합 | ✅ 25명 통과 |
| SupplierLedger 잔액 누적 정합 | ✅ 8개 통과 |
| EXCHANGED 주문 양방향 link | ✅ 3건 통과 |
| RentalAsset / Rental 상태 정합 | ✅ 통과 |



---

## 1. 고객 (25명)

| 구분 | 이름 | 전화 | 이메일 | 주소 |
| --- | --- | --- | --- | --- |
| 개인 | 김민준 | 010-1111-0001 | minjun@example.com | 서울 강남구 테헤란로 100 |
| 개인 | 이서연 | 010-1111-0002 | seoyeon@example.com | 서울 송파구 잠실로 50 |
| 개인 | 박지호 | 010-1111-0003 | jiho@example.com | 서울 마포구 합정동 200 |
| 개인 | 최예진 | 010-1111-0004 | - | 서울 종로구 인사동 33 |
| 개인 | 정도현 | 010-1111-0005 | dohyun@example.com | - |
| 개인 | 강수아 | 010-1111-0006 | - | 경기 성남시 분당구 정자동 11 |
| 개인 | 조하늘 | 010-1111-0007 | - | - |
| 개인 | 윤재민 | 010-1111-0008 | jaemin@example.com | - |
| 개인 | 임채원 | 010-1111-0009 | - | 인천 연수구 송도동 88 |
| 개인 | 한수빈 | 010-1111-0010 | - | - |
| 개인 | 오민서 | 010-1111-0011 | - | 부산 해운대구 우동 45 |
| 개인 | 신유나 | 010-1111-0012 | yuna@example.com | - |
| 개인 | 황지안 | 010-1111-0013 | - | - |
| 개인 | 안준호 | 010-1111-0014 | - | 대구 수성구 범어동 21 |
| 개인 | 송하준 | 010-1111-0015 | - | - |
| 개인 | 유서윤 | 010-1111-0016 | seoyoon@example.com | - |
| 개인 | 장태경 | 010-1111-0017 | - | - |
| 개인 | 권다은 | 010-1111-0018 | - | 광주 북구 운암동 17 |
| 기업 | (주)테크월드 | 02-3000-1001 | - | - |
| 기업 | 동방건설(주) | 031-700-2002 | - | - |
| 기업 | 스마트팩토리(주) | 032-500-3003 | - | - |
| 기업 | 한빛정비 | 02-2200-4004 | - | - |
| 기업 | (주)디자인스튜디오 | 02-6000-5005 | - | - |
| 기업 | 오피스마트 | 02-7000-6006 | - | - |
| 기업 | 메이커스랩 | 031-900-7007 | - | - |


---

## 2. 거래처 (8개)

| 이름 | 결제방식 | 결제기한 | 대표자 | 메모 |
| --- | --- | --- | --- | --- |
| 보쉬코리아 | CREDIT | 30일 | 김보쉬 | - |
| 마끼다코리아 | CREDIT | 45일 | 이마끼다 | - |
| 디월트유통 | CREDIT | 30일 | 박디월트 | - |
| 삼성공식대리점 | CREDIT | 60일 | 정삼성 | - |
| LG파트너스 | CREDIT | 30일 | 최엘지 | - |
| 글로벌툴(미국) | PREPAID | 0일 | John Smith | USD 결제 거래처 |
| JapanTech상사 | PREPAID | 0일 | Tanaka | JPY 결제 거래처 |
| 동방소모품 | PREPAID | 0일 | 강동방 | 선결제, 빠른 배송 |


---

## 3. 입고 (16건)

| 입고번호 | 거래처 | 날짜 | 상태 | 품목수 | 금액 | 배송비 | 메모 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IN260407-0001 | 보쉬코리아 | 2026-04-07 | CONFIRMED | 5 | 4,200,000원 | 22,000원 | 초기 입고 |
| IN260415-0001 | 보쉬코리아 | 2026-04-15 | CONFIRMED | 3 | 2,910,000원 | 15,000원 | - |
| IN260409-0001 | 마끼다코리아 | 2026-04-09 | CONFIRMED | 6 | 9,695,000원 | 30,000원 | - |
| IN260412-0001 | 디월트유통 | 2026-04-12 | CONFIRMED | 6 | 8,765,000원 | 35,000원 | - |
| IN260417-0001 | 삼성공식대리점 | 2026-04-17 | CONFIRMED | 7 | 12,695,000원 | 40,000원 | - |
| IN260419-0001 | LG파트너스 | 2026-04-19 | CONFIRMED | 5 | 13,980,000원 | 25,000원 | - |
| IN260422-0001 | 글로벌툴(미국) | 2026-04-22 | CONFIRMED | 5 | 3,608,000원 | 55,000원 | USD 매입 — 환율 적용 |
| IN260425-0001 | JapanTech상사 | 2026-04-25 | CONFIRMED | 4 | 3,328,000원 | 35,000원 | JPY 매입 |
| IN260427-0001 | 동방소모품 | 2026-04-27 | CONFIRMED | 10 | 3,745,000원 | 0원 | - |
| IN260428-0001 | 동방소모품 | 2026-04-28 | CONFIRMED | 4 | 1,720,000원 | 8,000원 | 안전화 변형 + 오일 + 호스 |
| IN260430-0001 | 보쉬코리아 | 2026-04-30 | CONFIRMED | 2 | 1,600,000원 | 18,000원 | 할인 입고 — 정가 대비 할인 |
| IN260502-0001 | 마끼다코리아 | 2026-05-02 | CONFIRMED | 2 | 2,745,000원 | 12,000원 | - |
| IN260504-0001 | 동방소모품 | 2026-05-04 | CONFIRMED | 2 | 435,000원 | 0원 | - |
| IN260505-0001 | 디월트유통 | 2026-05-05 | PENDING | 2 | 1,495,000원 | 25,000원 | 도착했지만 검수 전 — PENDING |
| IN260506-0001 | 삼성공식대리점 | 2026-05-06 | PENDING | 2 | 1,310,000원 | 15,000원 | 검수 대기 |
| IN260503-0001 | LG파트너스 | 2026-05-03 | CANCELLED | 1 | 360,000원 | 0원 | 수량 오류로 취소 |


**검증 시나리오** (`/inventory/incoming` 페이지):
- CONFIRMED 입고를 클릭하면 InventoryLot 이 정상 생성되어 있어야 함
- PENDING 입고는 "확정" 버튼이 노출되어야 하고 클릭 시 재고 + 로트 + 거래처원장(CREDIT)이 생성됨
- CANCELLED 입고는 재고 영향 없음

---

## 4. 발주 (10건) — 모든 status 케이스

| 발주번호 | 거래처 | 날짜 | 상태 | 품목수 | 금액 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- |
| PO260505-0001 | 보쉬코리아 | 2026-05-05 | DRAFT | 2 | 1,875,000원 | DRAFT — 작성 중, 아직 거래처 미발송 |
| PO260504-0001 | 마끼다코리아 | 2026-05-04 | SENT | 2 | 2,300,000원 | SENT — 거래처 발송, 응답 대기 |
| PO260502-0001 | 디월트유통 | 2026-05-02 | CONFIRMED | 2 | 4,975,000원 | CONFIRMED — 거래처 확정, 입고 대기 |
| PO260422-0001 | 삼성공식대리점 | 2026-04-22 | RECEIVED | 2 | 4,210,000원 | RECEIVED — 정상 입고완료 (한 번에 모두) |
| PO260417-0001 | 마끼다코리아 | 2026-04-17 | PARTIAL_COMPLETED | 2 | 11,000,000원 | PARTIAL_COMPLETED — 부분입고 후 잔량까지 모두 받음 |
| PO260425-0001 | 보쉬코리아 | 2026-04-25 | PARTIAL | 2 | 2,200,000원 | PARTIAL — 부분입고 진행 중 (재발송 결정 대기) |
| PO260419-0001 | 디월트유통 | 2026-04-19 | PARTIAL_RESENT | 1 | 3,525,000원 | PARTIAL_RESENT — 잔량 재요청 발송, 거래처 응답 대기 |
| PO260415-0001 | 보쉬코리아 | 2026-04-15 | PARTIAL_REACCEPTED | 1 | 1,160,000원 | PARTIAL_REACCEPTED — 거래처가 잔량 재요청 수락, 출하 대기 |
| PO260412-0001 | 삼성공식대리점 | 2026-04-12 | CLOSED | 1 | 7,250,000원 | CLOSED — 부분입고 후 잔량 포기로 종결 |
| PO260427-0001 | LG파트너스 | 2026-04-27 | CANCELLED | 1 | 3,880,000원 | CANCELLED — 단가 협상 결렬로 취소 |


**검증 시나리오** (`/purchase-orders` 페이지):
- DRAFT → "발송" 버튼 클릭으로 SENT 전이
- SENT → "거래처 확정" 클릭으로 CONFIRMED
- PARTIAL 상태 발주는 잔량 입고하면 PARTIAL_COMPLETED → 추가 입고 시 RECEIVED 자동 전이
- CLOSED 상태는 "잔량 포기" 결과 — 재오픈 불가
- CANCELLED 상태는 삭제만 가능 (편집 불가)

---

## 5. 견적서 (12건) — 판매·매입 모든 status

| 견적번호 | 종류 | 상태 | 고객·거래처 | 날짜 | 품목수 | 금액 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QUO260506-0001 | SALES | DRAFT | (주)테크월드 | 2026-05-06 | 2 | 8,340,000원 | 판매 DRAFT — 작성 중 |
| QUO260504-0001 | SALES | SENT | 동방건설(주) | 2026-05-04 | 2 | 3,052,000원 | 판매 SENT — 발송, 손님 응답 대기 |
| QUO260502-0001 | SALES | ACCEPTED | 스마트팩토리(주) | 2026-05-02 | 2 | 1,675,000원 | 판매 ACCEPTED — 손님 수락 (주문 전환 예정) |
| QUO260430-0001 | SALES | REJECTED | 한빛정비 | 2026-04-30 | 1 | 1,785,000원 | 판매 REJECTED — 손님 거절 |
| QUO260407-0001 | SALES | EXPIRED | (주)디자인스튜디오 | 2026-04-07 | 1 | 4,760,000원 | 판매 EXPIRED — 만료 |
| QUO260505-0001 | PURCHASE | DRAFT | 보쉬코리아 | 2026-05-05 | 2 | 3,275,000원 | 매입 DRAFT — 작성 중 |
| QUO260503-0001 | PURCHASE | SENT | 마끼다코리아 | 2026-05-03 | 1 | 1,900,000원 | 매입 SENT — 거래처에 단가 견적 요청 |
| QUO260501-0001 | PURCHASE | ACCEPTED | 디월트유통 | 2026-05-01 | 1 | 3,400,000원 | 매입 ACCEPTED — 단가 합의 (입고 전환 대기) |
| QUO260429-0001 | PURCHASE | REJECTED | LG파트너스 | 2026-04-29 | 1 | 3,840,000원 | 매입 REJECTED — 단가 미합의 |
| QUO260323-0001 | PURCHASE | EXPIRED | 글로벌툴(미국) | 2026-03-23 | 1 | 2,125원 | 매입 EXPIRED — 만료 |
| QUO260427-0001 | SALES | CONVERTED | 메이커스랩 | 2026-04-27 | 2 | 425,000원 | 판매 CONVERTED — 주문으로 전환 완료 (락) |
| QUO260425-0001 | PURCHASE | CONVERTED | 동방소모품 | 2026-04-25 | 2 | 1,150,000원 | 매입 CONVERTED — PO로 전환 완료 (락) |


**검증 시나리오** (`/quotations` 페이지):
- 판매 ACCEPTED 상태 견적은 "주문 전환" 버튼으로 Order 생성 가능 → 원본은 CONVERTED 락
- 매입 ACCEPTED 상태 견적은 "PO 전환" / "직접 입고" 두 옵션
- CONVERTED 견적은 편집·전환 모두 불가
- EXPIRED 는 만료일이 지난 SENT 자동 전이 표시

---

## 6. 거래명세표 (6건)

| 명세번호 | 고객 | 날짜 | 상태 | 품목수 | 금액 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- |
| STM260429-0001 | 메이커스랩 | 2026-04-29 | ISSUED | 2 | 467,500원 | ISSUED — 메이커스랩 정기 거래명세표 |
| STM260501-0001 | 동방건설(주) | 2026-05-01 | ISSUED | 3 | 787,600원 | ISSUED — 동방건설 자재 명세 |
| STM260503-0001 | 한빛정비 | 2026-05-03 | ISSUED | 2 | 577,500원 | ISSUED — 한빛정비 매월 정기 명세 |
| STM260504-0001 | (주)디자인스튜디오 | 2026-05-04 | ISSUED | 2 | 2,257,200원 | ISSUED — (주)디자인스튜디오 명세 |
| STM260505-0001 | 오피스마트 | 2026-05-05 | ISSUED | 2 | 1,287,000원 | ISSUED — 오피스마트 사무용품 명세 |
| STM260422-0001 | 스마트팩토리(주) | 2026-04-22 | CANCELLED | 1 | 742,500원 | VOIDED — 발행 후 무효 처리된 명세 |


---

## 7. 주문 (35건) — 3축 모든 조합

| 주문번호 | 고객·채널 | fulfillment | 출고상태 | 결제상태 | 결제수단 | claim | 사유 | 품목 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ORD260428-0001 | 김민준 / OFFLINE | PICKUP | COMPLETED | PAID | CARD | - | - | PRD-DRL-12V×1 | POS PICKUP / CARD / 개인 / 단품 |
| ORD260429-0001 | 이서연 / OFFLINE | PICKUP | COMPLETED | PAID | CASH | - | - | PRD-BIT-32P×2, PRD-DRB-10×5, PRD-WD40-360×3 | POS PICKUP / CASH / 다품목 |
| ORD260430-0001 | 메이커스랩 / OFFLINE | PICKUP | COMPLETED | PAID | TRANSFER | - | - | PRD-CTY-200×10, PRD-WD40-360×5, PRD-CGL-10×8, PRD-MSK-5×4 | POS PICKUP / TRANSFER / 기업 다품목 |
| ORD260501-0001 | 박지호 / OFFLINE | PICKUP | COMPLETED | PAID | MIXED | - | - | PRD-MON-27-4K×1, PRD-KB-TRIO500×1, PRD-MS-WL×1 | POS PICKUP / MIXED 결제 |
| ORD260502-0001 | 최예진 / OFFLINE | PICKUP | COMPLETED | PAID | CARD | - | - | PRD-SET-OFFICE×1 | POS PICKUP / 세트상품 |
| ORD260503-0001 | 정도현 / OFFLINE | DELIVERY | PREPARING | PAID | CARD | - | - | PRD-VAC-180×1 | POS DELIVERY / 즉시결제 PAID — 워크보드 PREPARING |
| ORD260504-0001 | 한빛정비 / 직접 | DELIVERY | PREPARING | UNPAID | UNPAID | - | - | PRD-WD40-360×10, PRD-CGL-10×15 | POS DELIVERY / 외상 UNPAID |
| ORD260425-0001 | 강수아 / COUPANG | SHIPPING | SHIPPED | PAID | CARD | - | - | PRD-IMP-18V×1 | 쿠팡 SHIPPING / 즉시결제 PAID / SHIPPED 상태 |
| ORD260427-0001 | 조하늘 / NAVER | SHIPPING | SHIPPED | UNPAID | UNPAID | - | - | PRD-DRL-12V×1, PRD-BIT-32P×1 | 네이버 SHIPPING / 외상 UNPAID / SHIPPED |
| ORD260422-0001 | 윤재민 / OWN | SHIPPING | COMPLETED | PAID | CARD | - | - | PRD-NB-PRO16×1, PRD-MS-WL×1 | 자사몰 SHIPPING / COMPLETED / 다품목 |
| ORD260505-0001 | 동방건설(주) / 직접 | DELIVERY | PENDING | UNPAID | UNPAID | - | - | PRD-COMBO-283×2, PRD-LZR-50×2 | B2B PENDING / 외상 / DELIVERY |
| ORD260504-0002 | 스마트팩토리(주) / 직접 | SHIPPING | PENDING | UNPAID | UNPAID | - | - | PRD-DTQ-DIG×1, PRD-FLK-MM-87V×1 | B2B PENDING / 외상 / SHIPPING (지연 D-2) |
| ORD260506-0001 | (주)테크월드 / 직접 | SHIPPING | PENDING | UNPAID | UNPAID | - | - | PRD-SSD-1TB-980P×5, PRD-EXT-4TB-T7×3 | B2B PENDING / SHIPPING / 오늘 출고 |
| ORD260506-0002 | 임채원 / COUPANG | SHIPPING | PREPARING | PAID | CARD | - | - | PRD-MON-27-4K×1 | 쿠팡 PREPARING / 오늘 출고 예정 |
| ORD260506-0003 | 한수빈 / NAVER | SHIPPING | PREPARING | PAID | TRANSFER | - | - | PRD-CRC-5604×1, PRD-HEX-100P×1 | 네이버 PREPARING / 이번주 출고 예정 |
| ORD260417-0001 | 오민서 / OFFLINE | PICKUP | COMPLETED | PAID | CARD | - | - | PRD-TW-001×1, PRD-DF-333×2 | 오프라인 COMPLETED / 다일자 / 다품목 (마진 리포트) |
| ORD260415-0001 | 신유나 / COUPANG | SHIPPING | COMPLETED | PAID | CARD | - | - | PRD-GRD-405×1 | 쿠팡 COMPLETED — 채널 수수료 검증용 |
| ORD260414-0001 | 황지안 / NAVER | SHIPPING | COMPLETED | PAID | TRANSFER | - | - | PRD-IMP-887×1 | 네이버 COMPLETED — 채널 수수료 검증용 |
| ORD260430-0002 | 안준호 / 직접 | SHIPPING | CANCELLED | UNPAID | UNPAID | - | - | PRD-BEAM-PF50×1 | PENDING 단계 취소 — 재고 미차감 |
| ORD260501-0002 | 송하준 / 직접 | SHIPPING | CANCELLED | REFUNDED | CARD | - | - | PRD-MON-32-UG×1 | PREPARING 후 취소 — 재고 복원 + REFUNDED |
| ORD260502-0002 | 유서윤 / 직접 | DELIVERY | CANCELLED | REFUNDED | CARD | - | - | PRD-TONE-FP×1 | PREPARING 후 취소 / DELIVERY |
| ORD260423-0001 | 장태경 / OFFLINE | PICKUP | RETURN_REQUESTED | PAID | CARD | REFUND | DEFECTIVE | PRD-DRL-12V×1 | RETURN_REQUESTED / 불량 / 회수 대기 결정 |
| ORD260421-0001 | 권다은 / OWN | SHIPPING | RETURN_REQUESTED | PAID | CARD | REFUND | CHANGE_MIND | PRD-TONE-FP×1 | RETURN_REQUESTED / 단순변심 / 결정 대기 |
| ORD260424-0001 | 김민준 / OFFLINE | DELIVERY | RETURN_ACCEPTED | PAID | CARD | EXCHANGE_DIFFERENT | SIZE_COLOR | PRD-VAC-180×1 | RETURN_ACCEPTED / 회수 진행 중 / 손님이 어떤 처리(환불/교환) 결정 대기 |
| ORD260416-0001 | 이서연 / OWN | SHIPPING | RETURNED | REFUNDED | CARD | REFUND | DEFECTIVE | PRD-GRD-750×1 | 3단계 RETURNED / 택배 회수 / 불량 환불 종결 |
| ORD260412-0001 | 박지호 / COUPANG | SHIPPING | RETURNED | REFUNDED | CARD | REFUND | CHANGE_MIND | PRD-MON-27-4K×1 | 3단계 RETURNED / 단순 변심 |
| ORD260426-0001 | 최예진 / OFFLINE | PICKUP | RETURNED | REFUNDED | CASH | REFUND | WRONG_ITEM | PRD-BIT-32P×1 | 1단계 매장 즉시 RETURNED — 손님이 바로 가져옴 |
| ORD260418-0001 | 정도현 / OWN | SHIPPING | EXCHANGED | PAID | CARD | EXCHANGE_SAME | DAMAGED_IN_TRANSIT | PRD-IMP-18V×1 | EXCHANGED SAME / 같은 상품 재발송 (새 주문 -EX 자동 생성) |
| ORD260420-0001 | 강수아 / OFFLINE | DELIVERY | EXCHANGED | PAID | CARD | EXCHANGE_SAME | DEFECTIVE | PRD-LZR-50×1 | EXCHANGED SAME / DELIVERY |
| ORD260419-0001 | (주)디자인스튜디오 / OWN | SHIPPING | EXCHANGED | PAID | CARD | EXCHANGE_DIFFERENT | SIZE_COLOR | PRD-MON-27-4K×1 | EXCHANGED DIFFERENT / 빈 새 주문 (사용자가 다른 상품 추가) / 차액 정산 |
| ORD260505-0002 | 안준호 / OFFLINE | PICKUP | COMPLETED | PAID | CARD | - | - | PRD-SHO-250×1 | 변형상품 — 안전화 250mm 판매 |
| ORD260504-0003 | 동방건설(주) / OFFLINE | DELIVERY | PREPARING | PAID | TRANSFER | - | - | PRD-SHO-290×3 | 변형상품 — 안전화 290mm 판매 |
| ORD260506-0004 | 한빛정비 / 직접 | PICKUP | COMPLETED | PAID | CARD | - | - | PRD-OIL-4L×2 | 오일 4L 병 판매 (벌크 분할 가능 SKU) |
| ORD260506-0005 | 스마트팩토리(주) / OFFLINE | DELIVERY | PREPARING | PAID | TRANSFER | - | - | PRD-HOSE-8MM×25 | 호스 8mm 미터 단위 판매 |
| ORD260505-0003 | (주)테크월드 / OFFLINE | DELIVERY | COMPLETED | PAID | CARD | - | - | PRD-PC-ASSEMBLED×1 | 조립 PC 판매 (조립 후 출고) |


### 주문 시나리오별 UI 검증 가이드

#### A. POS PICKUP / 즉시 종결 (5건)
- 모두 `COMPLETED` 상태로 시작. `/sales` 페이지에서 매출 합계 확인
- 채널 OFFLINE / 결제수단 다양 / 세트상품 1건 포함

#### B. POS DELIVERY / SHIPPING — 워크보드 진입
- `/orders` 워크보드에서:
  - **PREPARING** 그룹: 결제완료 발송대기
  - **PENDING** 그룹: B2B 외상 (재고 미차감)
  - **SHIPPED** 그룹: 트래킹번호 보유
- "지연" 카드: `expectedShipDate` 가 오늘보다 이전인 PENDING/PREPARING 주문

#### C. CANCELLED (3건)
- PENDING 단계 취소: 재고 미차감 → 복원 없음, ledger 영향 없음
- PREPARING 후 취소: 재고 복원 + paymentStatus REFUNDED + customer ledger REFUND 행 자동 추가

#### D. RETURN_REQUESTED (2건)
- COMPLETED 주문 → "반품 요청" 클릭 → claimType + claimReason 입력 → RETURN_REQUESTED
- 매장 결정 대기. "수락" / "반려" / "요청 취소" 3가지 액션 노출

#### E. RETURN_ACCEPTED (1건)
- 회수 진행 중 단계. 회수 완료 후 "환불 종결" / "교환 종결" 클릭 분기

#### F. RETURNED (3건)
- 1단계 매장 즉석 환불 (PICKUP) — claimType=REFUND 자동
- 3단계 택배 회수 후 환불 (SHIPPING) — paymentStatus=REFUNDED + ledger REFUND 행

#### G. EXCHANGED SAME (2건)
- 교환 종결 시 새 주문 자동 생성 (`-EX` 접미사) — 항목 동일 + paymentStatus=PAID + 재고 차감
- 양방향 link via `exchangeOrderId` — 새 주문 상세에서 원본 표시
- 마진 리포트에서 새 주문은 자동 제외 (매출 중복 방지)

#### H. EXCHANGED DIFFERENT (1건)
- 새 주문은 빈 항목 + paymentStatus=UNPAID + totalAmount=0
- 사용자가 직접 항목 추가 + 차액 결제 또는 환불 안내

#### 주문 매트릭스 검증 체크리스트
- [ ] 워크보드 그룹 분류 (오늘/지연/이번주/PENDING/PREPARING/SHIPPED) 정확
- [ ] 채널 수수료 스냅샷이 OrderItem 에 저장됨 (마진 리포트)
- [ ] PAID 결제 후 customer.balance == 0 (외상 아닌 케이스)
- [ ] UNPAID 주문 후 customer.balance > 0 (외상 누적)
- [ ] CANCELLED PREPARING 후 재고 복원 (Inventory.quantity 회복)
- [ ] EXCHANGED 새 주문이 마진 리포트 매출에서 빠짐
- [ ] RETURN_REQUESTED → 수락 후 회수 → 환불 또는 교환 분기

---

## 8. 수리 (10건)

| 티켓번호 | type | 상태 | 고객 | 증상 | 총금액 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- |
| R260505-0001 | ON_SITE | PICKED_UP | 김민준 | 드릴 베어링 마모 | 80,000원 | ON_SITE / 즉시수리 PICKED_UP — 보증 6개월 |
| R260506-0001 | DROP_OFF | RECEIVED | 이서연 | 전원이 들어오지 않음, 충전도 안됨 | 0원 | DROP_OFF / RECEIVED — 막 받은 상태 |
| R260505-0002 | DROP_OFF | DIAGNOSING | 박지호 | 사용 중 갑자기 멈춤, 발열 심함 | 0원 | DROP_OFF / DIAGNOSING — 진단 중 |
| R260504-0001 | DROP_OFF | QUOTED | 최예진 | 그라인더 모터 소음 | 198,000원 | DROP_OFF / QUOTED — 견적 안내, 손님 응답 대기 |
| R260505-0003 | DROP_OFF | APPROVED | 정도현 | 토크 측정기 영점 안 잡힘 | 60,000원 | DROP_OFF / APPROVED — 손님 승인, 작업 대기 |
| R260506-0002 | DROP_OFF | REPAIRING | 강수아 | 임팩트 토크 약함 | 105,000원 | DROP_OFF / REPAIRING — 작업 중 (재고 차감 진행) |
| R260506-0003 | DROP_OFF | READY | 조하늘 | 충전 안됨 | 188,000원 | DROP_OFF / READY — 픽업 대기 중 |
| R260503-0001 | ON_SITE | PICKED_UP | 윤재민 | 비트 분실 — 표준비트로 교체 | 44,000원 | ON_SITE / PICKED_UP — 즉시수리 + 결제 완료 |
| R260502-0001 | DROP_OFF | CANCELLED | 임채원 | 회로보드 고장 | 30,000원 | DROP_OFF / CANCELLED — 손님 거절 |
| R260507-0001 | DROP_OFF | READY | 김민준 | 베어링 다시 마모됨 — 보증 재수리 | 0원 | 재수리 / 보증 내 같은 증상 재입고 |


**검증 시나리오** (`/repairs`, POS `/pos/repairs`):
- RECEIVED → DIAGNOSING → QUOTED → APPROVED → REPAIRING → READY → PICKED_UP 단계별 카드 분류
- 부속(RepairPart) 추가 시 재고 자동 차감 + LotConsumption 생성 (REPAIRING 이상)
- PICKED_UP 시 Order 자동 생성 (`repairTicketId` 1:1) + customer ledger 반영
- CANCELLED 는 cancelReason enum 필수
- 재수리(보증 내) 는 `parentRepairTicketId` 로 추적 + 부속·공임 무료 처리

---

## 9. 임대 (6건)

| 임대번호 | 자산 | 고객 | 상태 | 기간 | 금액 | 시나리오 |
| --- | --- | --- | --- | --- | --- | --- |
| RNT260509-0001 | 마끼다 발전기 EG2500 | 동방건설(주) | RESERVED | 2026-05-09 ~ 2026-05-16 | 245,000원 | 예약 — 다음주부터 7일 임대 예약 |
| RNT260504-0001 | 보쉬 콘크리트 진동기 | 스마트팩토리(주) | ACTIVE | 2026-05-04 ~ 2026-05-11 | 175,000원 | 임대 중 — 진행 중 |
| RNT260422-0001 | 디월트 회전식 절단기 | 한빛정비 | ACTIVE | 2026-04-22 ~ 2026-05-22 | 520,000원 | 월 단위 임대 진행 중 |
| RNT260417-0001 | 히로 콤프레서 30L | 메이커스랩 | RETURNED | 2026-04-17 ~ 2026-04-24 | 154,000원 | 정상 반납 종결 |
| RNT260427-0001 | 휴대용 용접기 200A | (주)테크월드 | OVERDUE | 2026-04-27 ~ 2026-05-04 | 280,000원 | 연체 — 반환일 3일 지남 |
| RNT260502-0001 | 고압 세척기 1500W | 한빛정비 | CANCELLED | 2026-05-02 ~ 2026-05-09 | 126,000원 | 예약 취소 |


**검증 시나리오** (`/rentals`, `/rental-assets`):
- RentalAsset.status == "RENTED" 인 자산은 ACTIVE/OVERDUE 임대 1건 보유
- OVERDUE 는 endDate 가 지났는데 actualReturnedAt 없는 임대
- RETURNED 시 자산 상태 AVAILABLE 복원
- CANCELLED 은 임대 자산 점유 안 함

---

## 10. 시리얼 라벨 (5건)

| 코드 | 상품 | 고객 | 주문 | 보증종료 |
| --- | --- | --- | --- | --- |
| 260425-0001 | 보쉬 임팩트 드라이버 GDR18V | 강수아 | ORD260425-0001 | 2027-04-20 |
| 260422-0001 | 삼성 노트북 갤럭시북 Pro16 | 윤재민 | ORD260422-0001 | 2028-04-11 |
| 260505-0001 | 디월트 콤보세트 DCK283 | 동방건설(주) | ORD260505-0001 | 2029-04-19 |
| 260417-0001 | 마끼다 임팩트 렌치 TW001G | 오민서 | ORD260417-0001 | 2028-04-06 |
| 240101-9999 | Sony A7M4 Black (외부 기기) | 박지호 | - | - |


---

## 마지막 — 자동 검증을 다시 돌리고 싶으면

```bash
npm run db:seed
```

→ 항상 truncate + 처음부터 시드. 같은 결과 재현됨.
