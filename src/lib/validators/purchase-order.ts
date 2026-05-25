import { z } from "zod";

export const SHIPPING_METHODS = [
  "COURIER",
  "DIRECT_DELIVERY",
  "QUICK_OR_CARGO",
  "OTHER_SUPPLIER",
  "PICKUP",
] as const;
export type ShippingMethodValue = (typeof SHIPPING_METHODS)[number];

export const purchaseOrderItemSchema = z
  .object({
    // 자유입력 라인 도입: supplierProductId 또는 name 둘 중 하나는 필수.
    supplierProductId: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    // 가격 미정 플래그. true 면 단가는 0 으로 저장되고 외부 페이지에서 "가격 미정" 표시.
    priceUndetermined: z.boolean().optional(),
    quantity: z.string().min(1, "수량을 입력해주세요"),
    unitPrice: z.string().min(1, "단가를 입력해주세요"),
    totalPrice: z.string().optional(),
    memo: z.string().optional(),
  })
  .refine(
    (v) => (v.supplierProductId && v.supplierProductId.length > 0) || (v.name && v.name.trim().length > 0),
    { message: "공급자 상품 또는 품명을 입력해주세요", path: ["supplierProductId"] },
  );

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  orderDate: z.string().min(1, "발주일을 입력해주세요"),
  expectedDate: z.string().optional(),
  memo: z.string().optional(),
  quotationId: z.string().optional(),
  // 발송 시 우리가 사전 선택하는 출고 방법 (보통 PICKUP 또는 null). 거래처가 [수락] 모달에서 덮어쓸 수 있음.
  shippingMethod: z.enum(SHIPPING_METHODS).optional().nullable(),
  // 가격 미정 라인이 있을 때 거래처가 [수락] 모달에서 단가 입력 → 우리쪽 확인 후 수락 여부.
  requirePriceReview: z.boolean().optional(),
  items: z.array(purchaseOrderItemSchema).min(1, "발주 항목을 추가해주세요"),
});

// 외부 발주서 [수락] 모달 payload
//  - shippingMethod / promisedDate / shippingMemo: 출고 정보
//  - priceProposals: 가격 미정 라인이 있을 때 거래처가 제안한 단가 (itemId → 단가)
export const purchaseOrderAcceptSchema = z
  .object({
    shippingMethod: z.enum(SHIPPING_METHODS).optional().nullable(),
    promisedDate: z.string().min(1, "납기일(또는 출고 가능일)을 선택해주세요"),
    shippingMemo: z.string().optional().nullable(),
    priceProposals: z
      .array(
        z.object({
          itemId: z.string().min(1),
          unitPrice: z.number().nonnegative(),
        }),
      )
      .optional(),
  })
  .refine(
    // PICKUP 이 아닌 경우(=거래처 출고) shippingMethod 필수.
    (v) => v.shippingMethod === "PICKUP" || (v.shippingMethod && v.shippingMethod.length > 0),
    { message: "출고 방법을 선택해주세요", path: ["shippingMethod"] },
  );

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

// 상태 전이:
//   DRAFT → SENT → CONFIRMED → 입고 시작 → PARTIAL (부분입고)
//                                              ├─ 추가 입고 → PARTIAL_COMPLETED (자동)
//                                              ├─ "재발송" 액션 → PARTIAL_RESENT
//                                              │     ├─ "수락" 액션 → PARTIAL_REACCEPTED → 입고 → PARTIAL_COMPLETED
//                                              │     └─ "포기" 액션 → CLOSED
//                                              └─ "포기" 액션 → CLOSED
//                            CONFIRMED → 입고 한 번에 모두 → RECEIVED (정상)
export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "COUNTER_OFFER",
  "PARTIAL",
  "PARTIAL_RESENT",
  "PARTIAL_REACCEPTED",
  "PARTIAL_COMPLETED",
  "RECEIVED",
  "CLOSED",
  "CANCELLED",
] as const;

export const purchaseOrderStatusUpdateSchema = z.object({
  status: z.enum(PURCHASE_ORDER_STATUSES),
});
