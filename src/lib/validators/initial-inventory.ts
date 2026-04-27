import { z } from "zod";

const newSupplierProductSchema = z.object({
  name: z.string().min(1, "상품명을 입력해주세요"),
  spec: z.string().optional(),
  supplierCode: z.string().optional(),
  unitOfMeasure: z.string().default("EA"),
});

const initialInventoryItemSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  supplierProductId: z.string().optional(),
  newSupplierProduct: newSupplierProductSchema.optional(),
  quantity: z.string().min(1, "수량을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "수량은 0보다 큰 숫자여야 합니다"),
  unitPrice: z.string().min(1, "단가를 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "단가는 0 이상이어야 합니다"),
  originalPrice: z.string().optional(),
  discountAmount: z.string().optional(),
  spec: z.string().optional(),
  memo: z.string().optional(),
}).refine(
  (data) => data.supplierProductId || data.newSupplierProduct,
  { message: "기존 공급상품을 선택하거나 새로 등록해주세요" }
);

export const initialInventorySchema = z.object({
  items: z.array(initialInventoryItemSchema).min(1, "최소 1개 항목을 입력해주세요"),
});

export type InitialInventoryInput = z.infer<typeof initialInventorySchema>;
