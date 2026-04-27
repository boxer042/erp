import { z } from "zod";

export const assemblyComponentSchema = z.object({
  componentId: z.string().min(1, "구성품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
});

export const assemblySchema = z.object({
  productId: z.string().min(1, "조립상품을 선택해주세요"),
  quantity: z.string().min(1, "조립 수량을 입력해주세요"),
  assembledAt: z.string().min(1, "조립일을 입력해주세요"),
  laborCost: z.string().optional(),
  memo: z.string().optional(),
  components: z.array(assemblyComponentSchema).min(1, "구성품이 필요합니다"),
});

export type AssemblyInput = z.infer<typeof assemblySchema>;
