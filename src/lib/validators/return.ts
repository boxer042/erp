import { z } from "zod";

export const supplierReturnItemSchema = z.object({
  supplierProductId: z.string().min(1, "공급상품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  unitPrice: z.string().min(1, "단가를 입력해주세요"),
  memo: z.string().optional(),
});

export const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  returnDate: z.string().min(1, "반품일을 입력해주세요"),
  returnReason: z.string().optional(),
  memo: z.string().optional(),
  items: z.array(supplierReturnItemSchema).min(1, "반품 품목을 1개 이상 추가해주세요"),
  isExchange: z.boolean().default(false),
  returnCost: z.string().optional(),
  returnCostIsTaxable: z.boolean().default(true),
  returnCostType: z.enum(["ADD", "DEDUCT", "SEPARATE"]).optional(),
  returnCostNote: z.string().optional(),
});

export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;
