import { z } from "zod";

export const USED_ITEM_SOURCES = [
  "PURCHASED",
  "SCAVENGED",
  "RENTAL_RETIREMENT",
  "EMERGENCY_USE",
] as const;

export const USED_ITEM_STATUSES = [
  "IN_STOCK",
  "ASSEMBLED_INTO",
  "SOLD",
  "SCRAPPED",
] as const;

export const USED_ITEM_COST_TYPES = ["PART", "LABOR", "OTHER"] as const;

const decimalStringSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "숫자만 입력 가능합니다");

// 매입 등록 / 수정 공용 입력
export const usedItemSchema = z.object({
  displayName: z.string().min(1, "품명을 입력해주세요"),
  productId: z.string().nullish(),
  acquiredFrom: z.enum(USED_ITEM_SOURCES),
  acquiredCost: decimalStringSchema.default("0"),
  isAcquiredTaxable: z.boolean().default(false),
  acquiredAt: z.string().min(1, "매입일을 입력해주세요"),
  sourceCustomerId: z.string().nullish(),
  sourceMemo: z.string().nullish(),
  spec: z.string().nullish(),
  imageUrls: z.array(z.string()).nullish(),
  memo: z.string().nullish(),
  // 시리얼 발번 토글 — 기본값은 서버에서 카탈로그 매칭 + acquiredFrom 기반으로 결정
  issueSerial: z.boolean().optional(),
  // 시리얼 발번 시 보증 개월 (0 이면 보증 없음으로 처리)
  warrantyMonths: z.number().int().min(0).max(120).nullish(),
});

export type UsedItemInput = z.infer<typeof usedItemSchema>;

// 비용 가산 입력
export const usedItemCostSchema = z.object({
  costType: z.enum(USED_ITEM_COST_TYPES),
  amount: decimalStringSchema,
  description: z.string().min(1, "설명을 입력해주세요"),
  referenceType: z.string().nullish(),
  referenceId: z.string().nullish(),
});

export type UsedItemCostInput = z.infer<typeof usedItemCostSchema>;

// 폐기 (SCRAPPED 전환)
export const usedItemScrapSchema = z.object({
  reason: z.string().min(1, "폐기 사유를 입력해주세요"),
});

export type UsedItemScrapInput = z.infer<typeof usedItemScrapSchema>;

// 시리얼 발번 (사후)
export const usedItemIssueSerialSchema = z.object({
  warrantyMonths: z.number().int().min(0).max(120).default(0),
});

export type UsedItemIssueSerialInput = z.infer<typeof usedItemIssueSerialSchema>;
