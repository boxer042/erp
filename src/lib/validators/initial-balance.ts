import { z } from "zod";

const initialBalanceEntrySchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  date: z.string().optional(),
  memo: z.string().optional(),
});

export const initialBalanceSchema = z.object({
  entries: z.array(initialBalanceEntrySchema).min(1, "최소 1건 이상 입력해주세요"),
});

export type InitialBalanceInput = z.infer<typeof initialBalanceSchema>;
