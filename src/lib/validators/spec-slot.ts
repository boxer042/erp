import { z } from "zod";

export const SPEC_TYPES = ["TEXT", "NUMBER", "ENUM"] as const;
export type SpecType = (typeof SPEC_TYPES)[number];

export const specSlotSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요"),
  type: z.enum(SPEC_TYPES),
  unit: z.string().nullable().optional(),
  options: z.array(z.string()).default([]),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type SpecSlotInput = z.infer<typeof specSlotSchema>;

export const productSpecValueInputSchema = z.object({
  slotId: z.string().min(1),
  value: z.string(),
  order: z.number().int().default(0),
});

export const productSpecsInputSchema = z.object({
  values: z.array(productSpecValueInputSchema),
});

export type ProductSpecsInput = z.infer<typeof productSpecsInputSchema>;
