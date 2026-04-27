import { z } from "zod";

export const statementItemSchema = z.object({
  productId: z.string().optional().nullable(),
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

export const statementSchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "CANCELLED"]).default("ISSUED"),
  issueDate: z.string().min(1, "발행일자를 입력해주세요"),
  customerId: z.string().optional().nullable(),
  customerNameSnapshot: z.string().optional(),
  customerPhoneSnapshot: z.string().optional(),
  customerAddressSnapshot: z.string().optional(),
  customerBusinessNumberSnapshot: z.string().optional(),
  orderId: z.string().optional().nullable(),
  quotationId: z.string().optional().nullable(),
  memo: z.string().optional(),
  items: z.array(statementItemSchema).min(1, "품목을 하나 이상 추가해주세요"),
});

export type StatementInput = z.infer<typeof statementSchema>;
export type StatementItemInput = z.infer<typeof statementItemSchema>;
