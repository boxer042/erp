import { z } from "zod";

export const purchaseOrderItemSchema = z
  .object({
    // 자유입력 라인 도입: supplierProductId 또는 name 둘 중 하나는 필수.
    supplierProductId: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
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
  items: z.array(purchaseOrderItemSchema).min(1, "발주 항목을 추가해주세요"),
});

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
