import { z } from "zod";

export const assemblyTemplateSlotSchema = z.object({
  id: z.string().optional(), // 수정 시 기존 slot id
  label: z.string().min(1, "라벨을 입력해주세요"),
  slotLabelId: z.string().nullable().optional(),
  order: z.number().int(),
  defaultProductId: z.string().nullable().optional(),
  defaultQuantity: z.string().min(1, "기본 수량을 입력해주세요"),
  isVariable: z.boolean().optional().default(false),
});

export const assemblySlotLabelSchema = z.object({
  name: z.string().trim().min(1, "라벨명을 입력해주세요"),
  isActive: z.boolean().optional(),
});

export type AssemblySlotLabelInput = z.infer<typeof assemblySlotLabelSchema>;

export const assemblyTemplateSchema = z.object({
  name: z.string().min(1, "템플릿명을 입력해주세요"),
  description: z.string().optional(),
  defaultLaborCost: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  slots: z.array(assemblyTemplateSlotSchema).min(1, "슬롯이 최소 1개 필요합니다"),
});

export type AssemblyTemplateInput = z.infer<typeof assemblyTemplateSchema>;

export const assemblyPresetItemSchema = z.object({
  slotId: z.string().min(1),
  productId: z.string().min(1, "상품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
});

export const assemblyPresetSchema = z.object({
  name: z.string().min(1, "프리셋명을 입력해주세요"),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  items: z.array(assemblyPresetItemSchema).min(1, "프리셋 항목이 필요합니다"),
});

export type AssemblyPresetInput = z.infer<typeof assemblyPresetSchema>;
