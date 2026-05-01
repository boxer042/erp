type DecimalLike = { toString(): string } | string | number | null | undefined;

type SiblingItem = {
  id: string;
  totalPrice: DecimalLike;
  quantity: DecimalLike;
  itemShippingCost?: DecimalLike;
  itemShippingIsTaxable?: boolean;
};

type IncomingItemForShipping = {
  id: string;
  totalPrice: DecimalLike;
  quantity: DecimalLike;
  itemShippingCost?: DecimalLike;
  itemShippingIsTaxable?: boolean;
  incoming: {
    shippingCost: DecimalLike;
    shippingIsTaxable?: boolean;
    shippingDeducted?: boolean;
    items: SiblingItem[];
  };
};

const num = (v: DecimalLike): number =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : parseFloat(v.toString()) || 0;

const isDef = (v: DecimalLike): boolean =>
  v !== null && v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v));

/**
 * 공급상품의 확정된 과거 입고 내역으로부터 개당 평균 배송비(VAT포함)를 계산한다.
 *
 * 우선순위 (computeShippingPerUnitDisplay 와 동일):
 *  1) 그 IncomingItem 에 itemShippingCost 가 입력돼 있으면 그 값을 자기 운임으로 사용 (분배 무시)
 *  2) 아니면 Incoming.shippingCost 를 sibling 중 override 가 없는 품목들끼리 금액 비례 분배
 *  3) shippingDeducted=true 면 분배 품목은 평균에서 제외 (거래처 부담은 우리 운임이 아님)
 *
 * 평균에 0원 행도 포함 (정기 배송 0원 + 가끔 발생 운임을 합쳐 실질 평균을 추정).
 * 제외 케이스:
 *  - qty === 0 (개당 환산 무의미)
 *  - 분배 케이스에서 shippingDeducted=true (거래처 부담)
 */
export function computeSupplierProductAvgShipping(
  incomingItems: IncomingItemForShipping[]
): { avgShippingCost: number | null; avgShippingIsTaxable: boolean } {
  const allocations: { amount: number; isTaxable: boolean }[] = [];

  for (const item of incomingItems) {
    const qty = num(item.quantity);
    if (qty === 0) continue;

    let perUnit = 0;
    let isTaxable = !!item.incoming.shippingIsTaxable;

    if (isDef(item.itemShippingCost)) {
      // (1) 품목 직접 입력 — 그 자체가 운임. 차감과 무관. 0원이어도 포함
      const total = num(item.itemShippingCost);
      perUnit = total / qty;
      isTaxable = item.itemShippingIsTaxable ?? !!item.incoming.shippingIsTaxable;
    } else if (item.incoming.shippingDeducted) {
      // (3) 거래처 차감 → 분배 품목은 평균에서 제외
      continue;
    } else {
      // (2) 분배 — override 가 없는 sibling 들끼리 금액 비례. 헤더가 0 이면 perUnit=0 으로 평균에 포함
      const allocBase = item.incoming.items.reduce((sum, s) => {
        return isDef(s.itemShippingCost) ? sum : sum + num(s.totalPrice);
      }, 0);
      const headerShipping = num(item.incoming.shippingCost);
      if (allocBase === 0 || headerShipping === 0) {
        perUnit = 0;
      } else {
        const lineShipping = (num(item.totalPrice) / allocBase) * headerShipping;
        perUnit = lineShipping / qty;
      }
      isTaxable = !!item.incoming.shippingIsTaxable;
    }

    allocations.push({ amount: perUnit, isTaxable });
  }

  const avgShippingCost =
    allocations.length > 0
      ? allocations.reduce((sum, a) => sum + a.amount, 0) / allocations.length
      : null;
  const avgShippingIsTaxable =
    allocations.length > 0 ? allocations.some((a) => a.isTaxable) : false;

  return { avgShippingCost, avgShippingIsTaxable };
}

type IncomingCostForUnit = {
  costType: "FIXED" | "PERCENTAGE";
  value: { toString(): string } | string | number;
  isTaxable: boolean;
};

/**
 * 판매상품 1개당 세전 공급가액 원가를 계산한다.
 * = 공급단가/환산비율 + (입고비용 과세분 /1.1, 면세분 그대로)
 *
 * 배송비는 더 이상 인자로 받지 않는다. 실제 입고가 발생한 로트의 unitCost가 진실의 원천이며,
 * 미실현(상품 등록/베이스라인) 시뮬레이션에서는 배송비를 미반영. 입고가 1회라도 발생하면
 * 화면은 InventoryLot.unitCost 기반 가중평균(computeAvgInboundUnitCost)으로 즉시 정확해진다.
 */
export function computeUnitCost(args: {
  unitPrice: number;
  conversionRate: number;
  incomingCosts: IncomingCostForUnit[];
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

  return baseUnit + incomingPerUnit;
}
