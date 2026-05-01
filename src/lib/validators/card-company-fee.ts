import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable();

const rateString = z
  .string()
  .trim()
  .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0 && parseFloat(v) <= 1, {
    message: "수수료율은 0~1 사이 소수로 입력하세요 (예: 0.004)",
  });

const optionalRateString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .refine(
    (v) => v == null || (!isNaN(parseFloat(v)) && parseFloat(v) >= 0 && parseFloat(v) <= 1),
    { message: "수수료율은 0~1 사이 소수로 입력하세요" },
  );

export const cardCompanyFeeSchema = z.object({
  companyName: z.string().trim().min(1, "카드사명은 필수입니다"),
  merchantNo: optionalString.optional(),
  settlementBank: optionalString.optional(),
  settlementAccount: optionalString.optional(),
  creditRate: rateString,
  checkBankRate: optionalRateString.optional(),
  checkSpecialRate: optionalRateString.optional(),
  paymentDays: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type CardCompanyFeeInput = z.infer<typeof cardCompanyFeeSchema>;

export const cardMerchantInfoSchema = z.object({
  merchantTier: optionalString.optional(),
  appliedFrom: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
});

export type CardMerchantInfoInput = z.infer<typeof cardMerchantInfoSchema>;
