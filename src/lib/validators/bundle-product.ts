import { z } from "zod";

/**
 * BundleProduct (추가구매 추천) — 메인 상품에 단독 카탈로그 상품 매핑.
 * ProductOption 과 분리된 도메인 — 손님이 명시적으로 선택해서 추가 구매하는 별도 상품.
 */

export const bundleProductCreateSchema = z.object({
  bundleProductId: z.string().min(1, "추가 상품을 선택해주세요"),
  defaultQuantity: z.number().min(0.0001).default(1),
  discountAmount: z.number().min(0).nullable().optional(),
  recommendMessage: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const bundleProductUpdateSchema = z.object({
  defaultQuantity: z.number().min(0.0001).optional(),
  discountAmount: z.number().min(0).nullable().optional(),
  recommendMessage: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type BundleProductCreatePayload = z.infer<typeof bundleProductCreateSchema>;
export type BundleProductUpdatePayload = z.infer<typeof bundleProductUpdateSchema>;
