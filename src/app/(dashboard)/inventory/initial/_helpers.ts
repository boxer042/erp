import { calcDiscountPerUnit } from "@/lib/utils";
import type { ItemForm } from "./_types";

export const formatPrice = (n: number) => n.toLocaleString("ko-KR");

export interface LineCalc {
  qty: number;
  unitPrice: number;
  discPerUnit: number;
  actualPrice: number;
  lineSupply: number;
  lineTax: number;
}

export function calcLine(item: ItemForm): LineCalc {
  const qty = parseFloat(item.quantity || "0");
  const up = parseFloat(item.unitPrice || "0");
  const discPerUnit = calcDiscountPerUnit(up, item.discount);
  const actualPrice = up - discPerUnit;
  const lineSupply = item.supplyAmount
    ? parseFloat(item.supplyAmount)
    : actualPrice * qty;
  const lineTax = Math.round(lineSupply * 0.1);
  return { qty, unitPrice: up, discPerUnit, actualPrice, lineSupply, lineTax };
}

export interface Totals {
  validCount: number;
  totalSupply: number;
  totalTax: number;
  totalDiscount: number;
  totalAmount: number;
}

export function calcTotals(items: ItemForm[]): Totals {
  const valid = items.filter((i) => i.supplierProductId || i.isNew);
  const totalSupply = valid.reduce((sum, i) => sum + calcLine(i).lineSupply, 0);
  const totalDiscount = valid.reduce(
    (sum, i) => sum + calcLine(i).discPerUnit * calcLine(i).qty,
    0,
  );
  const totalTax = Math.round(totalSupply * 0.1);
  return {
    validCount: valid.length,
    totalSupply,
    totalTax,
    totalDiscount,
    totalAmount: Math.round(totalSupply) + totalTax,
  };
}

export interface PayloadItem {
  supplierId: string;
  supplierProductId?: string;
  newSupplierProduct?: {
    name: string;
    spec?: string;
    supplierCode?: string;
    unitOfMeasure: string;
  };
  spec?: string;
  quantity: string;
  unitPrice: string;
  originalPrice?: string;
  discountAmount?: string;
  memo?: string;
}

export function buildPayload(items: ItemForm[], supplierId: string): PayloadItem[] {
  return items
    .filter((i) => i.supplierProductId || i.isNew)
    .map((i) => {
      const { unitPrice: up, discPerUnit, actualPrice } = calcLine(i);
      return {
        supplierId,
        ...(i.isNew
          ? {
              newSupplierProduct: {
                name: i.supplierProductName,
                spec: i.spec || undefined,
                supplierCode: i.supplierCode || undefined,
                unitOfMeasure: i.unitOfMeasure,
              },
            }
          : { supplierProductId: i.supplierProductId, spec: i.spec || undefined }),
        quantity: i.quantity,
        unitPrice: String(actualPrice),
        ...(discPerUnit > 0
          ? { originalPrice: String(up), discountAmount: String(discPerUnit) }
          : {}),
        memo: i.memo || undefined,
      };
    });
}

export function isUnsavedItem(item: ItemForm): boolean {
  return !!(item.supplierProductId || item.isNew);
}

export function hasUnsaved(items: ItemForm[]): boolean {
  return items.some(isUnsavedItem);
}
