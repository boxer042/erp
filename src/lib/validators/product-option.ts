import { z } from "zod";

/**
 * ProductOption 입력 검증 스키마.
 *
 * 옵션값 처리 모드 (셋 중 최대 하나, 셋 다 null 허용):
 *  - mappedProductId: 다른 Product 매핑 (메모리 32GB → OrderItem OPTION_REF 별도 라인)
 *  - mappedVariantId: 매장 variant 매핑 (쿨러 → 수냉쿨러 variant 결정)
 *  - 둘 다 null: 단순 텍스트 옵션 (색상 화이트 → variant 자동 생성 후속)
 */

export const productOptionValueSchema = z.object({
  id: z.string().optional(), // 기존 값 update 시 사용
  label: z.string().min(1, "옵션값 라벨이 필요합니다"),
  addPrice: z.number().min(0).default(0),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  mappedProductId: z.string().nullable().optional(),
  mappedVariantId: z.string().nullable().optional(),
});

export const productOptionCreateSchema = z.object({
  name: z.string().min(1, "옵션 슬롯명이 필요합니다"),
  required: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  values: z.array(productOptionValueSchema).min(1, "최소 1개 옵션값이 필요합니다"),
});

export const productOptionUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  values: z.array(productOptionValueSchema).optional(),
});

export type ProductOptionValuePayload = z.infer<typeof productOptionValueSchema>;
export type ProductOptionCreatePayload = z.infer<typeof productOptionCreateSchema>;
export type ProductOptionUpdatePayload = z.infer<typeof productOptionUpdateSchema>;
