import { z } from "zod";

export const incomingItemSchema = z.object({
  supplierProductId: z.string().min(1, "공급자 상품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  unitPrice: z.string().min(1, "단가를 입력해주세요"),
  // 폼이 계산한 공급가액 합계 (totalPrice). VAT포함 입력 시 unitPrice 반올림 손실을
  // 피하기 위해 폼 값을 그대로 저장한다. 누락 시 API가 qty × unitPrice 로 폴백.
  totalPrice: z.string().optional(),
  originalPrice: z.string().optional(),
  discountAmount: z.string().optional(),
  itemShippingCost: z.string().nullable().optional(),
  itemShippingIsTaxable: z.boolean().optional(),
  // 발주서 기반 입고일 때, 어느 발주 항목에서 들어온 것인지 연결
  purchaseOrderItemId: z.string().optional(),
});

export const incomingSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  incomingDate: z.string().min(1, "입고일을 입력해주세요"),
  memo: z.string().optional(),
  shippingCost: z.string().optional(),
  shippingIsTaxable: z.boolean().optional(),
  shippingDeducted: z.boolean().optional(),
  // 발주서 기반 입고일 때 발주 ID
  purchaseOrderId: z.string().optional(),
  items: z.array(incomingItemSchema).min(1, "입고 항목을 추가해주세요"),
});

export type IncomingInput = z.infer<typeof incomingSchema>;
