import { z } from "zod";

export const channelSchema = z.object({
  name: z.string().min(1, "채널명을 입력해주세요"),
  code: z.string().min(1, "채널 코드를 입력해주세요").toUpperCase(),
  commissionRate: z.string().default("0"),
  memo: z.string().optional(),
});

export type ChannelInput = z.infer<typeof channelSchema>;

export const channelFeeSchema = z.object({
  name: z.string().min(1, "수수료 항목명을 입력해주세요"),
  feeType: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.string().min(1, "수수료 값을 입력해주세요"),
});

export type ChannelFeeInput = z.infer<typeof channelFeeSchema>;
