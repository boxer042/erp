import { z } from "zod";

/**
 * 예약된 채널 코드 — 등록 거부.
 * - SalesChannel 은 외부 판매채널 (쿠팡·네이버 등 — 수수료/OAuth/outbound 어댑터) 전용.
 * - 오프라인 매장 판매는 channelId=null 로 표현하므로 "OFFLINE" 등을 row 로 만들면 안 됨.
 *   (수수료 0% 무의미 행 + "외부 채널" 의미 흐려짐 + channelId !== null 식별 코드 깨짐)
 */
const RESERVED_CHANNEL_CODES = new Set([
  "OFFLINE",
  "POS",
  "STORE",
  "MANUAL",
  "INTERNAL",
  "EXTERNAL",
]);

export const channelSchema = z.object({
  name: z.string().min(1, "채널명을 입력해주세요"),
  code: z
    .string()
    .min(1, "채널 코드를 입력해주세요")
    .toUpperCase()
    .refine((code: string) => !RESERVED_CHANNEL_CODES.has(code), {
      message:
        "OFFLINE/POS/STORE/MANUAL/INTERNAL/EXTERNAL 은 예약된 코드입니다 — 오프라인·POS·매장 판매는 채널 등록이 아니라 channelId=null 로 자동 처리됩니다",
    }),
  commissionRate: z.string().default("0"),
  memo: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
});

export type ChannelInput = z.infer<typeof channelSchema>;

export const channelFeeSchema = z.object({
  name: z.string().min(1, "수수료 항목명을 입력해주세요"),
  feeType: z.enum(["PERCENTAGE", "FIXED"]),
  value: z.string().min(1, "수수료 값을 입력해주세요"),
});

export type ChannelFeeInput = z.infer<typeof channelFeeSchema>;
