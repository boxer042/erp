/**
 * 입고 배송비 분배 계산
 *
 * 우선순위:
 * 1. IncomingItem.itemShippingCost not null → 그 품목은 자기 운임. 분배에서 빠짐
 * 2. 그 외 품목은 Incoming.shippingCost를 자기들끼리 금액 비례 분배 (override 품목 제외)
 * 3. shippingDeducted=true → 분배 품목만 0, override 품목은 그대로
 *
 * 모든 입력 배송비는 VAT 포함 금액. 결과는 공급가액 기준 개당 배송비.
 */

export type IncomingShippingItem = {
  id: string;
  quantity: number | string;
  totalPrice: number | string;
  itemShippingCost: number | string | null | undefined;
  itemShippingIsTaxable: boolean;
};

export type IncomingShippingHeader = {
  shippingCost: number | string;
  shippingIsTaxable: boolean;
  shippingDeducted: boolean;
};

/**
 * 각 IncomingItem의 개당 배송비(공급가액 기준)를 반환한다.
 * @returns Map<itemId, shippingNetPerUnit>
 */
export function computeShippingNetPerUnit(
  items: IncomingShippingItem[],
  header: IncomingShippingHeader
): Map<string, number> {
  const headerShipping = Number(header.shippingCost) || 0;
  let allocBase = 0;
  const overrideIds = new Set<string>();
  for (const item of items) {
    if (item.itemShippingCost !== null && item.itemShippingCost !== undefined) {
      overrideIds.add(item.id);
    } else {
      allocBase += Number(item.totalPrice);
    }
  }

  const result = new Map<string, number>();
  for (const item of items) {
    const qty = Number(item.quantity);
    if (qty <= 0) {
      result.set(item.id, 0);
      continue;
    }

    if (overrideIds.has(item.id)) {
      const lineShipping = Number(item.itemShippingCost) || 0;
      const perUnit = lineShipping / qty;
      const net = item.itemShippingIsTaxable ? perUnit / 1.1 : perUnit;
      result.set(item.id, net);
      continue;
    }

    if (header.shippingDeducted) {
      result.set(item.id, 0);
      continue;
    }

    const lineShipping = allocBase > 0
      ? (Number(item.totalPrice) / allocBase) * headerShipping
      : 0;
    const perUnit = lineShipping / qty;
    const net = header.shippingIsTaxable ? perUnit / 1.1 : perUnit;
    result.set(item.id, net);
  }
  return result;
}

/**
 * 입고 이력 표시용: IncomingItem 별 효과값(개당 배송비 VAT포함) + 출처 라벨
 */
export type ShippingHistorySource = "ITEM" | "ALLOCATED" | "DEDUCTED" | "ZERO";

export function computeShippingPerUnitDisplay(
  items: IncomingShippingItem[],
  header: IncomingShippingHeader
): Map<string, { perUnit: number; isTaxable: boolean; source: ShippingHistorySource }> {
  const headerShipping = Number(header.shippingCost) || 0;
  let allocBase = 0;
  const overrideIds = new Set<string>();
  for (const item of items) {
    if (item.itemShippingCost !== null && item.itemShippingCost !== undefined) {
      overrideIds.add(item.id);
    } else {
      allocBase += Number(item.totalPrice);
    }
  }

  const result = new Map<string, { perUnit: number; isTaxable: boolean; source: ShippingHistorySource }>();
  for (const item of items) {
    const qty = Number(item.quantity);
    if (overrideIds.has(item.id)) {
      const total = Number(item.itemShippingCost) || 0;
      result.set(item.id, {
        perUnit: qty > 0 ? total / qty : 0,
        isTaxable: item.itemShippingIsTaxable,
        source: total > 0 ? "ITEM" : "ZERO",
      });
      continue;
    }
    if (header.shippingDeducted) {
      result.set(item.id, { perUnit: 0, isTaxable: header.shippingIsTaxable, source: "DEDUCTED" });
      continue;
    }
    if (allocBase <= 0 || headerShipping <= 0) {
      result.set(item.id, { perUnit: 0, isTaxable: header.shippingIsTaxable, source: "ZERO" });
      continue;
    }
    const lineShipping = (Number(item.totalPrice) / allocBase) * headerShipping;
    result.set(item.id, {
      perUnit: qty > 0 ? lineShipping / qty : 0,
      isTaxable: header.shippingIsTaxable,
      source: "ALLOCATED",
    });
  }
  return result;
}
