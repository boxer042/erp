import type { SellingCost } from "@prisma/client";

/**
 * 단위당 판매비용 합산 (세전/공급가액 기준).
 *
 * - FIXED: 사용자가 VAT 포함 금액으로 입력한 값. isTaxable이면 /1.1 환산.
 * - PERCENTAGE: unitPrice(세전) × value%. VAT 변환 불필요.
 *
 * @param costs 적용할 SellingCost 배열 (전사 + 해당 채널 합산 전제)
 * @param unitPrice 세전 판매 단가
 */
export function computeSellingCostPerUnit(
  costs: Pick<SellingCost, "costType" | "value" | "isTaxable">[],
  unitPrice: number,
): number {
  let total = 0;
  for (const c of costs) {
    const v = Number(c.value);
    if (c.costType === "FIXED") {
      total += c.isTaxable ? v / 1.1 : v;
    } else {
      total += unitPrice * (v / 100);
    }
  }
  return total;
}
