import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(1, "고객명을 입력해주세요"),
  phone: z.string().min(1, "연락처를 입력해주세요"),
  businessNumber: z.string().optional(),
  ceo: z.string().optional(),
  email: z.string().email("이메일 형식이 올바르지 않습니다").optional().or(z.literal("")),
  address: z.string().optional(),
  memo: z.string().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
