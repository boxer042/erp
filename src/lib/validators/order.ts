import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1, "상품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  unitPrice: z.string().min(1, "단가를 입력해주세요"),
});

export const fulfillmentTypeSchema = z.enum(["PICKUP", "DELIVERY", "SHIPPING"]);
export const orderPaymentMethodSchema = z.enum([
  "CASH",
  "CARD",
  "TRANSFER",
  "MIXED",
  "UNPAID",
]);

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
  fulfillmentType: fulfillmentTypeSchema.default("PICKUP"),
  expectedShipDate: z.string().optional(),  // YYYY-MM-DD
  paymentMethod: orderPaymentMethodSchema.optional(),
  discountAmount: z.string().default("0"),
  shippingFee: z.string().default("0"),
  memo: z.string().optional(),
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
  trackingCarrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  /** 항목 replace — PENDING 한정. min(1) 보장은 API 측에서 (자유 입력 라인 허용). */
  items: z.array(orderItemSchema).optional(),
  discountAmount: z.string().optional(),
  shippingFee: z.string().optional(),
});

export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
