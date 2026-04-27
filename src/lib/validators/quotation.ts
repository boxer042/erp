import { z } from "zod";

export const quotationItemSchema = z.object({
  productId: z.string().optional().nullable(),
  supplierProductId: z.string().optional().nullable(),
  name: z.string().min(1, "품명을 입력해주세요"),
  spec: z.string().optional(),
  unitOfMeasure: z.string().default("EA"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  listPrice: z.string().optional(),
  discountAmount: z.string().optional(),
  unitPrice: z.string().min(1, "단가를 입력해주세요"),
  isTaxable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  memo: z.string().optional(),
});

export const quotationSchema = z
  .object({
    type: z.enum(["SALES", "PURCHASE"]),
    status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"]).default("DRAFT"),
    issueDate: z.string().min(1, "견적일자를 입력해주세요"),
    validUntil: z.string().optional(),
    customerId: z.string().optional().nullable(),
    supplierId: z.string().optional().nullable(),
    title: z.string().optional(),
    memo: z.string().optional(),
    terms: z.string().optional(),
    items: z.array(quotationItemSchema).min(1, "품목을 하나 이상 추가해주세요"),
  })
  .refine(
    (v) => (v.type === "SALES" ? !!v.customerId : !!v.supplierId),
    { message: "거래 상대방을 선택해주세요" }
  );

export type QuotationInput = z.infer<typeof quotationSchema>;
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
