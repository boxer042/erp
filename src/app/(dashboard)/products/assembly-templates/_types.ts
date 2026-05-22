export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  defaultLaborCost: string | null;
  isActive: boolean;
  _count: { slots: number; presets: number };
  createdAt: string;
}

export interface SlotRow {
  id?: string;
  label: string;
  slotLabelId: string | null;
  order: number;
  defaultProductId: string | null;
  defaultQuantity: string;
  isVariable: boolean;
}

export interface SlotLabelRow {
  id: string;
  name: string;
  isActive: boolean;
  /** 후보 상품 카테고리 — 설정 시 구성품 콤보박스가 해당 카테고리 상품만 노출 */
  categoryId: string | null;
  category: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count: { slots: number };
}

export interface CategoryOption {
  id: string;
  name: string;
  children: Array<{ id: string; name: string }>;
}
