import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

export const companyInfoSchema = z.object({
  name: z.string().trim().min(1, "상호는 필수입니다"),
  businessNumber: optionalString.optional(),
  ceo: optionalString.optional(),
  phone: optionalString.optional(),
  email: optionalString.optional(),
  address: optionalString.optional(),
  businessType: optionalString.optional(),
  businessItem: optionalString.optional(),
});

export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, "은행명은 필수입니다"),
  holder: z.string().trim().min(1, "예금주는 필수입니다"),
  account: z.string().trim().min(1, "계좌번호는 필수입니다"),
  isPrimary: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional(),
});

export type BankAccountInput = z.infer<typeof bankAccountSchema>;
