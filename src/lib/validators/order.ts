import { z } from "zod";

export const orderItemSchema = z
  .object({
    // 상품 라인은 productId, 기술료/공임 등 서비스 라인은 serviceName — 둘 중 하나 필수
    productId: z.string().optional(),
    /** 기술료/공임 등 상품 없는 서비스 라인명 — productId 없을 때 사용 */
    serviceName: z.string().optional(),
    /** 선판매(미등록) 자유 라인 구별 — "used"=미등록 중고. 사후 정리에서 기술료와 구별 */
    presaleKind: z.enum(["used", "catalog"]).optional(),
    quantity: z.string().min(1, "수량을 입력해주세요"),
    /** 라인 단가 (세전, 정수) — 할인 적용 전 단가 (POS 와 동일 정책). 실제 OrderItem.unitPrice 는 unitPrice - discountPerUnit */
    unitPrice: z.string().min(1, "단가를 입력해주세요"),
    /**
     * 개당 할인액 (세전, 정수). 미지정 시 0.
     * - OrderItem.discountAmount 로 저장
     * - OrderItem.unitPrice = (input.unitPrice - discountPerUnit) 로 저장
     * - OrderItem.listPrice = input.listPrice ?? input.unitPrice 로 저장 (정가 보존)
     */
    discountPerUnit: z.string().optional(),
    /** 정가 (세전, 정수) — 카탈로그 listPrice. 미지정 시 unitPrice 사용 */
    listPrice: z.string().optional(),
    /**
     * 고객이 선택한 옵션값 ID 들 — 결제 시 OrderItem 의 optionSnapshot + OPTION_REF 자식 라인 자동 생성에 사용.
     * 주문 후 보존되는 건 optionSnapshot (옵션값 라벨 mapping). 이 ID 들은 transient 용.
     */
    optionValueIds: z.array(z.string()).optional(),
    /**
     * 진입 경로 SKU — 자사몰/외부 채널 한정. SWAP 옵션으로 productId 가 swap 된 후 손님이 본 카탈로그 SKU 보존.
     * POS 는 직원 입력이라 노이즈 우려로 안 쓰는 게 정책 (analytics 쿼리에서 IS NOT NULL 로 필터).
     */
    entryProductId: z.string().nullable().optional(),
  })
  .refine((v) => !!v.productId?.trim() || !!v.serviceName?.trim(), {
    message: "상품 또는 기술료 항목명을 입력해주세요",
    path: ["productId"],
  });

export const fulfillmentTypeSchema = z.enum([
  "IN_STORE", // 매장 즉시판매 (POS 결제 + 즉시 인도)
  "PICKUP",   // 매장 픽업 대기 (결제 후 추후 방문 수령)
  "DELIVERY", // 자체 배달 (매장 직원·차량)
  "QUICK",    // 퀵 호출 (외부 퀵 업체)
  "SHIPPING", // 택배 (외부 택배사)
]);
export const shippingPaymentTypeSchema = z.enum([
  "PREPAID",       // 손님 결제 시 함께 (자사몰/일반 POS 택배)
  "COD",           // 착불 (받는 사람이 택배기사에게)
  "STORE_BURDEN",  // 매장 부담 (배송비 무료 / 도매)
]);
/**
 * 결제수단 enum.
 *  - MIXED 는 **deprecated** — 신규 입력 차단. 부분 결제(PARTIAL_PAID + paidAmount) 로 대체.
 *    기존 데이터 호환을 위해 enum 값 자체는 유지 (DB 응답 처리 + 통계 라벨 노출).
 *  - 신규 입력은 refine 으로 차단 — `orderSchema` 의 paymentMethod 필드에서 검증.
 */
export const orderPaymentMethodSchema = z
  .enum([
    "CASH",
    "CASH_RECEIPT", // 현금영수증 발행 — 손님 휴대폰/사업자번호로 국세청 영수증 발급
    "CARD",
    "TRANSFER",
    "MIXED",        // deprecated — 신규 입력 차단 (아래 refine)
    "UNPAID",
  ])
  .refine((v) => v !== "MIXED", {
    message:
      "MIXED(혼합) 결제는 더 이상 신규 입력 불가 — 부분 결제(paidAmount + partialPaymentKind) 또는 결제수단을 단일로 선택해주세요",
  });

export const orderSchema = z.object({
  channelId: z.string().nullable().optional(),  // null/undefined = 오프라인 매출
  channelOrderNo: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  shippingAddress: z.string().optional(),
  orderDate: z.string().min(1, "주문일을 입력해주세요"),
  fulfillmentType: fulfillmentTypeSchema.default("IN_STORE"),
  expectedShipDate: z.string().optional(),  // YYYY-MM-DD
  paymentMethod: orderPaymentMethodSchema.optional(),
  /**
   * 즉시 결제된 금액(VAT 포함) — 부분 결제 케이스용.
   * 미지정 또는 totalAmount 와 같으면 전액 결제(PAID).
   * 0 보다 크고 totalAmount 보다 작으면 PARTIAL_PAID + 잔액은 customerLedger SALE.
   * UNPAID 결제 또는 미입력 결제일 땐 무시됨.
   */
  paidAmount: z.string().optional(),
  /** 부분 결제 구분 — paidAmount<totalAmount 일 때 의미. DEPOSIT(계약금) / PARTIAL(부분결제) */
  partialPaymentKind: z.enum(["DEPOSIT", "PARTIAL"]).optional(),
  /** 세금계산서 발행 요청 — true 면 발행 대기 목록에 노출 (사장이 추후 발행) */
  taxInvoiceRequested: z.boolean().optional(),
  discountAmount: z.string().default("0"),
  shippingFee: z.string().default("0"),
  shippingPaymentType: shippingPaymentTypeSchema.default("PREPAID"),
  /** 배송 원가 (매장 지불) — 우리가 낸 퀵비·택배비. 마진에서 차감, 손님 청구 무관 */
  shippingCostBorne: z.string().default("0"),
  memo: z.string().optional(),
  /**
   * 등록 직전 자동 발번된 SerialItem 코드들 — POS checkout 과 동일 정책.
   * 서버가 OrderItem 과 매칭해 orderItemId/customerId 연결. trackable 상품만 발번됨.
   * 미지정 시 라벨 매칭 스킵 (외부 채널 import 등 라벨 무관 흐름).
   */
  labelCodes: z.array(z.string()).optional(),
  /**
   * 분할 출고 — 한 결제를 매장수령(대표 A)/택배 백오더(B) 등 여러 주문으로 나눌 때 연결.
   * 프론트가 그룹 UUID 를 생성해 A·B 두 요청에 동일 splitGroupId 전달, B 에는 A.id 를 splitParentId 로.
   * 각 주문은 자기 품목만큼 정상 생성(결제·원장 자체 보유) — 백엔드는 링크만 저장. docs/SPLIT_FULFILLMENT.md
   */
  splitGroupId: z.string().optional(),
  splitParentId: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "주문 항목을 추가해주세요"),
});

export type OrderInput = z.infer<typeof orderSchema>;
export type FulfillmentType = z.infer<typeof fulfillmentTypeSchema>;

/**
 * 주문 수정 — 상세 Sheet 의 편집 모드에서 사용. 모든 필드 optional.
 * 종결 상태(COMPLETED/CANCELLED/RETURNED/EXCHANGED) 의 주문은 API 에서 차단.
 *
 * 항목 편집(`items`) 은 PENDING 한정. 재고 차감 전이라 안전.
 * PATCH 시 items 배열 전달하면 기존 OrderItem 모두 삭제 후 재생성 (replace).
 * subtotalAmount/taxAmount/totalAmount/commissionAmount 자동 재계산.
 */
export const orderUpdateSchema = z.object({
  fulfillmentType: fulfillmentTypeSchema.optional(),
  /** YYYY-MM-DD 또는 빈 문자열(=null 로 초기화) */
  expectedShipDate: z.string().optional(),
  recipientName: z.string().optional(),
  recipientPhone: z.string().optional(),
  shippingAddress: z.string().optional(),
  channelOrderNo: z.string().optional(),
  memo: z.string().optional(),
  /** 세금계산서 발행 요청 — 종결 주문 포함 어느 상태에서나 토글 가능 (CANCELLED 제외) */
  taxInvoiceRequested: z.boolean().optional(),
  trackingCarrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  /** 항목 replace — PENDING 한정. min(1) 보장은 API 측에서 (자유 입력 라인 허용). */
  items: z.array(orderItemSchema).optional(),
  discountAmount: z.string().optional(),
  shippingFee: z.string().optional(),
  shippingPaymentType: shippingPaymentTypeSchema.optional(),
  shippingCostBorne: z.string().optional(),
});

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
