export interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

export interface SupplierProduct {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  /** 매핑이 있는지 — 행마다 dot 표시 용도 */
  hasMapping?: boolean;
}

export interface ItemForm {
  supplierProductId: string;
  supplierProductName: string;
  supplierCode: string;
  spec: string;
  unitOfMeasure: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  supplyAmount: string;
  memo: string;
  isNew?: boolean;
  pendingSourceRow?: number;
}

export interface InitialHistoryItem {
  id: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitOfMeasure: string;
  unitPrice: string;
  createdAt: string;
  supplier: { id: string; name: string };
}

export interface PendingNewProduct {
  name: string;
  spec: string;
  supplierCode: string;
  rowIndex: number;
}

export const emptyItem = (): ItemForm => ({
  supplierProductId: "",
  supplierProductName: "",
  supplierCode: "",
  spec: "",
  unitOfMeasure: "EA",
  quantity: "",
  unitPrice: "",
  discount: "",
  supplyAmount: "",
  memo: "",
});

export const TAB_OPTIONS = [
  { value: "register", label: "등록" },
  { value: "history", label: "이력" },
] as const;

export type Tab = (typeof TAB_OPTIONS)[number]["value"];
