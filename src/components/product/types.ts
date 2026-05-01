// 상품 상세/카탈로그 공용 타입

export interface IncomingCostItem {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE" | string;
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

export interface ProductMappingItem {
  id: string;
  conversionRate: string;
  supplierProduct: {
    id: string;
    name: string;
    supplierCode: string | null;
    unitPrice: string;
    isProvisional: boolean;
    supplier: { id?: string; name: string };
    incomingCosts?: IncomingCostItem[];
  };
}

export interface SetComponentItem {
  id: string;
  quantity: string;
  label?: string | null;
  component: { id: string; name: string; sku: string };
}

export interface ChannelPricingItem {
  id: string;
  channelId: string;
  sellingPrice: string;
  channel: { id?: string; name: string; code: string; logoUrl?: string | null };
}

export interface SellingCostItem {
  id: string;
  channelId: string | null;
  name: string;
  costType: "FIXED" | "PERCENTAGE" | string;
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

export interface VariantItem {
  id: string;
  name: string;
  sku: string;
  sellingPrice?: string;
  inventory: { quantity: string } | null;
  variableComponents?: Array<{
    slotLabel: string | null;
    componentName: string;
    componentSku: string;
    quantity: string;
  }>;
  /** 그 변형의 잔여 lot 가중평균 단가 (공급단가+배송비+부대비용 누적) — API 응답에 enriched */
  avgInboundUnitCost?: number;
}

export interface InventoryLotItem {
  id: string;
  receivedAt: string;
  receivedQty: string;
  remainingQty: string;
  unitCost: string;
  source: string;
  supplierProduct?: {
    id: string;
    name: string;
    supplier: { name: string };
  } | null;
  // 추가: API enrich 필드 (없을 수도 있어 모두 optional)
  incomingId?: string | null;
  incomingNo?: string | null;
  shippingPerUnit?: number;
  shippingIsTaxable?: boolean;
  shippingSource?: "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO";
  isCurrentlyConsuming?: boolean;
  /** canonical 합산 표시용 — 어느 변형의 lot 인지 */
  variant?: { id: string; name: string; sku: string } | null;
}

export interface InventoryMovementItem {
  id: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  reason: string | null;
  referenceType: string | null;
  memo: string | null;
  createdAt: string;
  /** canonical 합산 표시용 — 어느 변형/단일 상품의 movement 인지 */
  inventory?: {
    product: { id?: string; name: string; sku: string };
  } | null;
}

export interface ProductMediaItem {
  id: string;
  productId: string;
  type: "IMAGE" | "YOUTUBE";
  url: string;
  title: string | null;
  sortOrder: number;
}

export interface BulkParentRef {
  id: string;
  name: string;
  sku: string;
  containerSize: string | null;
  unitOfMeasure: string;
  sellingPrice?: string;
}

// 상세 페이지 전체 응답 (GET /api/products/[id])
export interface ProductDetail {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  unitOfMeasure: string;
  taxType: string;
  taxRate?: string;
  sellingPrice: string;
  listPrice?: string;
  productType: string;
  brand: string | null;
  brandId: string | null;
  brandRef?: { id: string; name: string; logoUrl: string | null } | null;
  spec: string | null;
  modelName: string | null;
  isSet: boolean;
  isCanonical?: boolean;
  canonicalProductId?: string | null;
  canonicalProduct?: { id: string; name: string; sku: string } | null;
  variants?: VariantItem[];
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
  isBulk: boolean;
  containerSize?: string | null;
  bulkProductId?: string | null;
  bulkProduct?: BulkParentRef | null;
  imageUrl: string | null;
  memo: string | null;
  assemblyTemplateId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  inventory: { quantity: string; safetyStock: string; avgCost?: string | null } | null;
  productMappings: ProductMappingItem[];
  setComponents: SetComponentItem[];
  channelPricings: ChannelPricingItem[];
  sellingCosts: SellingCostItem[];
  media?: ProductMediaItem[];
  inventoryLots?: InventoryLotItem[];
  specValues?: ProductSpecValueItem[];
  estimatedUnitCost?: number | null;
  estimatedMargin?: number | null;
  estimatedMarginRate?: number | null;
  estimatedCostBreakdown?: Array<{
    componentId: string;
    componentName: string;
    componentSku: string;
    label?: string | null;
    quantity: number;
    unitCost: number;
    supplierUnitPrice?: number;
    shippingPerUnit?: number;
    incomingCostPerUnit?: number;
    subtotal: number;
    costSource: "LOT" | "SUPPLIER" | "BULK_PARENT" | "NONE";
    supplierName?: string | null;
    supplierProductName?: string | null;
    incomingCostList?: Array<{ name: string; costType: string; value: number; isTaxable: boolean }>;
  }>;
  missingCostCount?: number;
  estimatedMarginByChannel?: Array<{
    channelId: string;
    channelName: string;
    channelCode: string;
    channelSellingPrice: number;
    channelFeeTotal: number;
    estimatedMargin: number;
    estimatedMarginRate: number | null;
  }>;
  canonicalAggregatedUnitCost?: number;
  canonicalAggregatedQty?: number;
}

export interface ProductSpecSlotItem {
  id: string;
  name: string;
  type: "TEXT" | "NUMBER" | "ENUM";
  unit: string | null;
  options: string[];
  order: number;
  isActive: boolean;
}

export interface ProductSpecValueItem {
  id: string;
  productId: string;
  slotId: string;
  value: string;
  order: number;
  slot: ProductSpecSlotItem;
}

export type ProductCardVariant = "admin" | "customer" | "compact";
