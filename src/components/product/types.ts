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
  channel: { id?: string; name: string; code: string };
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
}

export type ProductCardVariant = "admin" | "customer" | "compact";
