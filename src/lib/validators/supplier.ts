import { z } from "zod";
import { isValidBusinessNumber, digitsOnly } from "@/lib/utils";

export const supplierContactSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "담당자명을 입력해주세요"),
  phone: z.string().optional(),
  email: z.string().email("올바른 이메일을 입력해주세요").optional().or(z.literal("")),
  position: z.string().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1, "거래처명을 입력해주세요"),
  businessNumber: z.string()
    .optional()
    .refine(
      (v) => {
        if (!v) return true;
        const d = digitsOnly(v);
        if (d.length === 0) return true;
        return isValidBusinessNumber(d);
      },
      { message: "사업자번호 형식 또는 체크섬이 올바르지 않습니다" }
    ),
  representative: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().email("올바른 이메일을 입력해주세요").optional().or(z.literal("")),
  address: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankHolder: z.string().optional(),
  paymentMethod: z.enum(["CREDIT", "PREPAID"]),
  paymentTermDays: z.coerce.number().int().min(0).default(30),
  memo: z.string().optional(),
  contacts: z.array(supplierContactSchema).optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierContactInput = z.infer<typeof supplierContactSchema>;

export const SUPPLIER_PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "PROMISSORY_NOTE", "OTHER"] as const;
export type PaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "현금",
  TRANSFER: "계좌이체",
  CARD: "카드",
  PROMISSORY_NOTE: "어음",
  OTHER: "기타",
};

// 결제 종류 — 부가세 후납 추적용 (잔액 영향 없음, 분류만)
export const PAYMENT_KIND = ["MIXED", "SUPPLY_ONLY", "VAT_ONLY"] as const;
export const PAYMENT_KIND_LABELS: Record<(typeof PAYMENT_KIND)[number], string> = {
  MIXED: "전체 (공급가액 + 부가세)",
  SUPPLY_ONLY: "공급가액만",
  VAT_ONLY: "부가세만",
};

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  paymentDate: z.string().min(1, "결제일을 선택해주세요"),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  kind: z.enum(PAYMENT_KIND).default("MIXED"),
  memo: z.string().optional(),
});

export const supplierPaymentUpdateSchema = z.object({
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  paymentDate: z.string().min(1, "결제일을 선택해주세요"),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  kind: z.enum(PAYMENT_KIND).default("MIXED"),
  memo: z.string().optional(),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
