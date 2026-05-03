# 시리얼 라벨(SerialItem) 시스템 설계 메모

작성일: 2026-05-02
ERP 본 프로젝트 + (장차) 분리될 QR 랜딩 페이지 프로젝트의 공통 기획서.

---

## 1. 목적

판매한 큰 상품(카메라, 가전 등)에 **개별 추적 코드 + QR 라벨**을 붙여 다음을 가능하게 한다.

- 라벨 스티커로 어느 손님이 언제 산 어떤 물건인지 즉시 확인
- 수리 접수 시 코드 한 번에 상품·구매자·구매일·보증 자동 채움
- 전화/채팅 상담 시 손님이 코드 부르면 컨텍스트 즉시 확보
- QR 스캔으로 손님이 직접 구매 내역·보증 상태·상품 설명을 다시 볼 수 있음

## 2. 코드 형식

```
YYMMDD-NNNN
241125-0042
```

- 일별 4자리 시퀀스 (00시 0001부터 카운트, 9999까지)
- 동시 발번 안전 → DB 트랜잭션 내에서 카운트 + insert
- 라벨에 큰 글씨로 인쇄, 전화로 부를 수 있게 짧게 유지
- **개인정보(손님명) 코드에 미포함** — 개인정보 노출 방지

## 3. 데이터 모델 (Prisma)

```prisma
model Product {
  // ... 기존 필드
  trackable       Boolean @default(false)  // 개별추적 대상 여부
  warrantyMonths  Int?                     // 보증 기간 (개월)
}

model SerialItem {
  id            String   @id @default(cuid())
  code          String   @unique   // "241125-0042"
  productId     String
  product       Product  @relation(fields: [productId], references: [id])
  orderItemId   String?  // 주문 확정 후 연결 (장바구니 단계에선 null)
  orderItem     OrderItem? @relation(fields: [orderItemId], references: [id])
  customerId    String?
  customer      Customer? @relation(fields: [customerId], references: [id])
  soldAt        DateTime
  warrantyEnds  DateTime?
  status        SerialItemStatus @default(ACTIVE)
  memo          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([code])
  @@index([customerId])
  @@index([productId])
  @@index([orderItemId])
}

enum SerialItemStatus {
  ACTIVE      // 정상 활성
  RETURNED    // 반품됨
  SCRAPPED    // 폐기
  // LOST는 추후 필요시 추가 (회원가입 비공개라 즉각 무효화 필요성 낮음)
}
```

## 4. 코드 발번 시점

- **장바구니 안 "라벨" 타일** 클릭 시 즉시 발번 → 라벨 인쇄 모달
- 같은 카트(quotationFingerprint와 유사한 hash)면 기존 코드 재사용
- 카트 변경 시 기존 코드 폐기 + 재발번
- 결제(checkout) 시 SerialItem.orderItemId 연결, soldAt = order.orderDate, warrantyEnds = soldAt + product.warrantyMonths

## 5. 라벨 인쇄

- **프린터**: Brother QL 시리즈 (전용 라벨 프린터, OS 인쇄 다이얼로그 통해 인쇄)
- **라벨 크기**: 62mm × 35mm 가정 (필요시 조정)
- **인쇄 페이지**: `/serial-items/print?codes=241125-0042,241125-0043`
- 한 라벨 = 한 페이지(`@page size: 62mm 35mm`)
- 라벨 내용 (개인정보 제거):
  ```
  ┌──────────────────────┐
  │ ▓▓▓▓▓  241125-0042   │
  │ ▓ QR▓  Sony A7M4     │
  │ ▓▓▓▓▓  보증 ~2025-11 │
  └──────────────────────┘
  ```
  - 좌측: QR 코드
  - 우측: 코드(가장 큰 모노폰트), 상품명, 보증만료
- QR 인코딩 URL: `${NEXT_PUBLIC_QR_BASE_URL}/s/{code}`

## 6. QR 랜딩 페이지 (별도 프로젝트로 분리될 가능성 높음)

### URL 설계
```
https://{운영도메인}/s/{code}
예) https://example.com/s/241125-0042
```
- ERP 환경변수 `NEXT_PUBLIC_QR_BASE_URL`에 운영 도메인 저장
- URL 패턴은 한 번 결정되면 변경 불가 (인쇄된 라벨 영구). 도메인은 변경 가능 (DNS·리다이렉트로 처리)

### 접근 정책
- **회원가입(또는 로그인) 필수** — 비회원에게는 로그인 페이지 노출만
- 보증 만료 후에도 조회 항상 가능 — 라벨 가치 평생 유지
- 도난·분실 시 무효화는 일단 보류 (회원가입 비공개라 노출 위험 낮음). 추후 `SerialItemStatus.LOST` 추가만 하면 됨

### 페이지 표시 정보 (로그인 사용자 기준)

**일반 정보** (구매자 본인 외에도 보일 수 있음):
- 상품명·이미지
- 상품 설명 / 사용법 / 매뉴얼 (Product.description, 마크다운/HTML 풍부 콘텐츠)
- 구매일
- 보증 상태(유효/만료) + 보증 만료일

**구매자 본인만 보임**:
- 구매 가격
- 주문번호 (orderItemId → Order)
- 수리 이력
- 메모

**관리자(직원) 추가 표시**:
- 모든 위 정보
- 내부 노트
- 코드 상태 변경 액션(반품/폐기 처리)

### 별도 프로젝트로 분리 시 인터페이스

ERP에서 노출해야 할 API (아직 미구현):

```
GET /api/public/serial-items/:code
  → 인증된 사용자 토큰을 헤더로 받음
  → 응답: { code, productName, productImage, productDescription, soldAt, warrantyEnds, warrantyActive, isOwner, ...본인일 때 추가 필드 }

GET /api/public/serial-items/:code/repairs  (본인만)
  → 수리 이력 리스트
```

별도 프로젝트의 책임:
- 회원가입/로그인 (Supabase 같은 공용 인증 서버 공유 권장)
- ERP API 호출 + 토큰 전달
- UI 렌더링 (모바일 우선)

## 7. 향후 작업 (현재 범위 외)

- 수리 등록 화면에 "코드로 찾기" 입력 → SerialItem 자동 채움
- 고객 상세 페이지에 "보유 자산" 탭 (해당 customerId의 SerialItem 목록)
- 결제 확정 시 SerialItem.orderItemId·soldAt·warrantyEnds 자동 연결
- 코드 무효화(`status=LOST`) UI
- 운영 도메인 확정 후 `.env.production`에 `NEXT_PUBLIC_QR_BASE_URL` 설정

## 8. 환경변수

`.env.local` / `.env.production`:
```
NEXT_PUBLIC_QR_BASE_URL=https://example.com
```
미설정 시 라벨에는 QR이 들어가지만 스캔해도 example.com으로 갈 뿐 (개발 환경 가정). 운영 배포 전 반드시 실제 도메인으로 교체.
