import type { ProductOption } from "@/components/product-combobox";

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
}

export interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

export interface SupplierProductCostItem {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

export interface SupplierProduct {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  listPrice: string;
  unitPrice: string;
  unitOfMeasure: string;
  isTaxable: boolean;
  memo: string | null;
  incomingCosts?: SupplierProductCostItem[];
}

export interface CostRow {
  id: string;
  serverId?: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

export interface Channel {
  id: string;
  name: string;
  commissionRate: string;
}

export interface ChannelPriceRow {
  channelId: string;
  price: string;
  enabled: boolean;
  lastEdited: "price" | "rate" | "amount" | null;
  targetRate: string;
  targetAmount: string;
}

export interface SetComponentRow {
  id: string;
  product: ProductOption | null;
  quantity: string;
  /** 템플릿/프리셋에서 채워진 슬롯 라벨 (표시 전용) */
  label?: string;
  /** 변형 모드: 메인의 어느 setComponent 행에서 파생됐는지 추적 */
  mainId?: string;
  /** 변형 모드: 사용자가 product를 직접 수정했는지 여부 (override 보존용) */
  override?: boolean;
}

export interface ParentProductRow {
  id: string;
  product: ProductOption | null;
  quantity: string;
}

export type ProductType = "FINISHED" | "PARTS" | "SET" | "ASSEMBLED";

export const TYPE_ACCENT: Record<ProductType, string> = {
  FINISHED: "#3ECF8E",
  PARTS: "#60a5fa",
  SET: "#fbbf24",
  ASSEMBLED: "#f97316",
};

export function generateSku() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `P${y}${m}${d}-${r}`;
}

export const emptyCostRow = (): CostRow => ({
  id: Math.random().toString(36).slice(2),
  name: "",
  costType: "FIXED",
  value: "",
  perUnit: false,
  isTaxable: true,
});

export const emptySetComponent = (): SetComponentRow => ({
  id: Math.random().toString(36).slice(2),
  product: null,
  quantity: "1",
});

export const emptyParentRow = (): ParentProductRow => ({
  id: Math.random().toString(36).slice(2),
  product: null,
  quantity: "1",
});
