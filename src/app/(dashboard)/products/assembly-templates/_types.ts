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
  createdAt: string;
  updatedAt: string;
  _count: { slots: number };
}
