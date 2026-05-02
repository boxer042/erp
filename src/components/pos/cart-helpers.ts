import { calcDiscountPerUnit } from "@/lib/utils";
import type { CartSession, CartItem } from "@/components/pos/sessions-context";

export interface CartTotals {
  subtotalNet: number;       // 라인 할인 적용 후, 세션 할인 전 공급가액
  sessionDiscountAmount: number; // 세션 할인 환산액 (세전)
  net: number;               // 최종 공급가액
  vat: number;               // 부가세 합계
  total: number;             // 판매액 (net + vat)
}

/**
 * 카트 합계 계산.
 * - 라인 할인은 라인별로 차감
 * - 세션 할인은 합계에서 단순 차감 (분배 없음)
 * - VAT는 라인 단위로 계산 (TAX_FREE/isZeroRate는 면세)
 *   세션 할인은 비례적으로 라인의 과세/면세 비율을 따라 분배되도록 처리
 */
export function calcCartTotals(session: CartSession): CartTotals {
  let taxableNet = 0;
  let exemptNet = 0;

  for (const i of session.items) {
    const lineNet = (i.unitPrice - calcDiscountPerUnit(i.unitPrice, i.discount)) * i.quantity;
    const isExempt = i.taxType === "TAX_FREE" || i.isZeroRate;
    if (isExempt) exemptNet += lineNet;
    else taxableNet += lineNet;
  }

  const subtotalNet = taxableNet + exemptNet;
  const discountStr = (session.totalDiscount ?? "0").trim();

  let sessionDiscountAmount = 0;
  if (discountStr.endsWith("%")) {
    const pct = Math.min(100, Math.max(0, parseFloat(discountStr.slice(0, -1)) || 0));
    sessionDiscountAmount = Math.round((subtotalNet * pct) / 100);
  } else {
    sessionDiscountAmount = Math.min(subtotalNet, Math.max(0, parseFloat(discountStr.replace(/,/g, "")) || 0));
  }

  // 세션 할인을 과세/면세 비율로 분배
  const taxableShare = subtotalNet > 0 ? taxableNet / subtotalNet : 0;
  const taxableDiscount = sessionDiscountAmount * taxableShare;
  const exemptDiscount = sessionDiscountAmount - taxableDiscount;

  const finalTaxableNet = Math.max(0, taxableNet - taxableDiscount);
  const finalExemptNet = Math.max(0, exemptNet - exemptDiscount);
  const net = finalTaxableNet + finalExemptNet;
  const vat = Math.round(finalTaxableNet * 0.1);

  return {
    subtotalNet,
    sessionDiscountAmount,
    net,
    vat,
    total: net + vat,
  };
}

export function lineDisplayPrice(item: CartItem): {
  net: number;
  vat: number;
  total: number;
} {
  const netUnit = item.unitPrice - calcDiscountPerUnit(item.unitPrice, item.discount);
  const net = netUnit * item.quantity;
  const isExempt = item.taxType === "TAX_FREE" || item.isZeroRate;
  const vat = isExempt ? 0 : Math.round(net * 0.1);
  return { net, vat, total: net + vat };
}

export function summarizeItems(items: CartItem[], maxLabels = 2): {
  labels: string[];
  more: number;
  totalQty: number;
} {
  const labels = items.slice(0, maxLabels).map((i) => {
    const qty = i.isBulk ? `${i.quantity}${i.unitOfMeasure ?? ""}` : `×${i.quantity}`;
    return `${i.name} ${qty}`;
  });
  return {
    labels,
    more: Math.max(0, items.length - maxLabels),
    totalQty: items.reduce((a, b) => a + b.quantity, 0),
  };
}
