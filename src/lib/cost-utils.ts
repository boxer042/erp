type IncomingItemForShipping = {
  totalPrice: { toString(): string } | string | number;
  quantity: { toString(): string } | string | number;
  incoming: {
    shippingCost: { toString(): string } | string | number;
    shippingIsTaxable?: boolean;
    shippingDeducted?: boolean;
    items: { totalPrice: { toString(): string } | string | number }[];
  };
};

const num = (v: { toString(): string } | string | number): number =>
  typeof v === "number" ? v : parseFloat(v.toString());

/**
 * 공급상품의 확정된 과거 입고 내역으로부터 개당 평균 배송비를 계산한다.
 * 각 입고에서 금액 비례로 배송비를 배분한 뒤 수량으로 나누어 입고별 개당 배송비를 구하고, 평균.
 * 배송비의 과세 여부는 해당 공급상품이 포함된 입고들의 shippingIsTaxable 중 어느 하나라도 true면 true.
 */
export function computeSupplierProductAvgShipping(
  incomingItems: IncomingItemForShipping[]
): { avgShippingCost: number | null; avgShippingIsTaxable: boolean } {
  const allocations: number[] = [];
  let anyTaxable = false;

  for (const item of incomingItems) {
    const incomingTotal = item.incoming.items.reduce(
      (sum, i) => sum + num(i.totalPrice),
      0
    );
    const shippingCost = num(item.incoming.shippingCost);
    const qty = num(item.quantity);
    if (incomingTotal === 0 || shippingCost === 0 || qty === 0) continue;
    if (item.incoming.shippingDeducted) continue;

    const lineShipping = (num(item.totalPrice) / incomingTotal) * shippingCost;
    if (lineShipping === 0) continue;
    allocations.push(lineShipping / qty);
    if (item.incoming.shippingIsTaxable) anyTaxable = true;
  }

  const avgShippingCost =
    allocations.length > 0
      ? allocations.reduce((sum, v) => sum + v, 0) / allocations.length
      : null;

  return { avgShippingCost, avgShippingIsTaxable: anyTaxable };
}

type IncomingCostForUnit = {
  costType: "FIXED" | "PERCENTAGE";
  value: { toString(): string } | string | number;
  isTaxable: boolean;
};

/**
 * 판매상품 1개당 세전 공급가액 원가를 계산한다.
 * = 공급단가/환산비율 + (입고비용 과세분 /1.1, 면세분 그대로) + (배송비 과세분 /1.1)
 */
export function computeUnitCost(args: {
  unitPrice: number;
  conversionRate: number;
  incomingCosts: IncomingCostForUnit[];
  avgShippingCost: number | null;
  avgShippingIsTaxable: boolean;
}): number {
  const convRate = args.conversionRate > 0 ? args.conversionRate : 1;
  const baseUnit = args.unitPrice / convRate;

  const incomingPerUnit = args.incomingCosts.reduce((sum, c) => {
    const value = num(c.value);
    if (c.costType === "FIXED") {
      const raw = value / convRate;
      return sum + (c.isTaxable ? raw / 1.1 : raw);
    }
    const raw = (args.unitPrice * value) / 100 / convRate;
    return sum + (c.isTaxable ? raw / 1.1 : raw);
  }, 0);

  const shippingPerUnit =
    args.avgShippingCost !== null
      ? args.avgShippingCost / convRate / (args.avgShippingIsTaxable ? 1.1 : 1)
      : 0;

  return baseUnit + incomingPerUnit + shippingPerUnit;
}
