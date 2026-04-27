import { z } from "zod";

export const STOCKTAKE_REASONS = [
  "PHYSICAL_COUNT",
  "DAMAGE",
  "LOSS",
  "FOUND",
  "SAMPLE",
  "MISCOUNT",
  "OTHER",
] as const;

export const STOCKTAKE_REASON_LABELS: Record<(typeof STOCKTAKE_REASONS)[number], string> = {
  PHYSICAL_COUNT: "실물 수량 차이",
  DAMAGE: "파손",
  LOSS: "분실",
  FOUND: "누락 재고 발견",
  SAMPLE: "샘플/증정",
  MISCOUNT: "수량 착오",
  OTHER: "기타",
};

const stocktakeItemSchema = z.object({
  productId: z.string().min(1, "상품을 선택해주세요"),
  actualQuantity: z.string().min(1, "실사 수량을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "수량은 0 이상이어야 합니다"),
  reason: z.enum(STOCKTAKE_REASONS),
  supplierProductId: z.string().optional(),
  memo: z.string().optional(),
});

export const stocktakeSchema = z.object({
  items: z.array(stocktakeItemSchema).min(1, "최소 1개 항목을 입력해주세요"),
});

export type StocktakeInput = z.infer<typeof stocktakeSchema>;
