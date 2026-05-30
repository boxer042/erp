import { z } from "zod";

export const USED_ITEM_SOURCES = [
  "PURCHASED",
  "SCAVENGED",
  "RENTAL_RETIREMENT",
  "EMERGENCY_USE",
  "BUILT",
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

// 중고 조립 (케이스 B) — 여러 중고 + (선택) 신품 부품 → 새 단품(BUILT)
export const usedItemBuildSchema = z.object({
  // 결과물 정보
  displayName: z.string().min(1, "결과물 품명을 입력해주세요"),
  productId: z.string().nullish(), // 카탈로그 매칭 (선택)
  spec: z.string().nullish(),
  memo: z.string().nullish(),
  imageUrls: z.array(z.string()).nullish(),
  builtAt: z.string().min(1, "조립일을 입력해주세요"),
  laborCost: decimalStringSchema.default("0"),
  // 사용한 조립 템플릿 (선택) — 슬롯 구조를 빌려옴
  assemblyTemplateId: z.string().nullish(),
  // 시리얼 발번 (결과물 단품 판매 예정이면)
  issueSerial: z.boolean().optional(),
  warrantyMonths: z.number().int().min(0).max(120).nullish(),
  // 재료 ① 중고 단품 (IN_STOCK) — { usedItemId, slotLabel? } 형태 (slotLabel 은 템플릿 모드)
  sources: z
    .array(
      z.object({
        usedItemId: z.string().min(1),
        slotLabel: z.string().nullish(),
      }),
    )
    .min(1, "중고 재료를 1개 이상 선택해주세요"),
  // 재료 ② 신품 부품 (선택) — productId + 수량 + slotLabel?
  parts: z
    .array(
      z.object({
        componentId: z.string().min(1),
        quantity: z.string().regex(/^\d+(\.\d+)?$/, "수량은 숫자"),
        slotLabel: z.string().nullish(),
      }),
    )
    .default([]),
});

export type UsedItemBuildInput = z.infer<typeof usedItemBuildSchema>;
