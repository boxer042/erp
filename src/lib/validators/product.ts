import { z } from "zod";

export const productSchema = z.object({
  name: z.string().min(1, "상품명을 입력해주세요"),
  brand: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  modelName: z.string().nullable().optional(),
  spec: z.string().nullable().optional(),
  sku: z.string().min(1, "SKU를 입력해주세요"),
  description: z.string().nullable().optional(),
  unitOfMeasure: z.string().default("EA"),
  productType: z.enum(["FINISHED", "PARTS", "SET", "ASSEMBLED"]).default("FINISHED"),
  taxType: z.enum(["TAXABLE", "TAX_FREE"]).default("TAXABLE"),
  zeroRateEligible: z.boolean().default(false),
  taxRate: z
    .string()
    .default("0.1")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0 && n <= 1;
    }, "세율은 0~1 사이 값이어야 합니다"),
  listPrice: z
    .string()
    .default("0")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0;
    }, "정가는 0 이상이어야 합니다"),
  sellingPrice: z
    .string()
    .default("0")
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0;
    }, "판매가는 0 이상이어야 합니다"),
  isSet: z.boolean().default(false),
  isCanonical: z.boolean().default(false),
  canonicalProductId: z.string().nullable().optional(),
  // 벌크 사용 (Phase 9)
  isBulk: z.boolean().default(false),
  containerSize: z.string().nullable().optional(),
  bulkProductId: z.string().nullable().optional(),
  createBulk: z
    .object({
      name: z.string().min(1),
      unitOfMeasure: z.string().default("mL"),
    })
    .nullable()
    .optional(),
  imageUrl: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  assemblyTemplateId: z.string().nullable().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const supplierProductSchema = z.object({
  supplierId: z.string().min(1, "거래처를 선택해주세요"),
  name: z.string().min(1, "상품명을 입력해주세요"),
  spec: z.string().optional(),
  supplierCode: z.string().optional(),
  unitOfMeasure: z.string().default("EA"),
  listPrice: z.string().default("0"),
  unitPrice: z.string().default("0"),
  currency: z.string().default("KRW"),
  leadTimeDays: z.coerce.number().int().optional(),
  minOrderQty: z.coerce.number().int().min(1).default(1),
  isTaxable: z.boolean().default(true),
  isProvisional: z.boolean().default(false),
  memo: z.string().optional(),
});

export type SupplierProductInput = z.infer<typeof supplierProductSchema>;

export const productMappingSchema = z.object({
  supplierProductId: z.string().min(1, "공급자 상품을 선택해주세요"),
  productId: z.string().min(1, "판매 상품을 선택해주세요"),
  conversionRate: z.string().default("1"),
  isProvisional: z.boolean().optional(),
});

export type ProductMappingInput = z.infer<typeof productMappingSchema>;

export const setComponentSchema = z.object({
  componentId: z.string().min(1, "구성품을 선택해주세요"),
  quantity: z.string().min(1, "수량을 입력해주세요"),
  label: z.string().nullable().optional(),
  slotLabelId: z.string().nullable().optional(),
});

export type SetComponentInput = z.infer<typeof setComponentSchema>;
