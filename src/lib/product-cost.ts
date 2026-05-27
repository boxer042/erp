/**
 * 판매상품(Product)의 "공급자 기반 현재 단위 원가" 계산.
 *
 * - 단품/벌크: 첫 매핑(또는 벌크 부모 첫 매핑)의 supplier unitPrice + 부대비용(VAT 환산).
 *   배송비는 미반영 — 미실현 시뮬레이션이라 lot 기반 평균이 진실의 원천.
 * - 조립(ASSEMBLED) / 세트(isSet): 구성품들의 같은 공식 unitCost × quantity 합.
 *
 * 이 값은 "원가 변동 안내" 기능의 비교 기준이 되며,
 * `Product.acknowledgedUnitCost` 와 비교해 ↑/↓ 알림을 띄운다.
 *
 * 주의: 상세 페이지의 estimatedUnitCost(lot 가중평균 + 배송비 + bulk parent 폴백) 과는 별개.
 * 알림은 "최신 공급가 변동" 추적이 목적이므로 lot 평균보다 supplier 단가가 더 적절.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { computeUnitCost } from "@/lib/cost-utils";

type PrismaLike = PrismaClient | Prisma.TransactionClient;

type DecimalLike = { toString(): string } | string | number | null | undefined;
const num = (v: DecimalLike): number =>
  v === null || v === undefined ? 0 : typeof v === "number" ? v : parseFloat(v.toString()) || 0;

export type IncomingCostInput = {
  costType: string;
  value: DecimalLike;
  isTaxable: boolean;
};

export type MappingInput = {
  conversionRate: DecimalLike;
  supplierProduct: {
    unitPrice: DecimalLike;
    incomingCosts: IncomingCostInput[];
  };
};

export type BulkContainerInput = {
  containerSize: DecimalLike;
  productMappings: MappingInput[];
};

export type SetComponentInput = {
  componentId: string;
  quantity: DecimalLike;
};

export type ProductCostInput = {
  id: string;
  productType: string;
  isSet: boolean;
  isBulk: boolean;
  productMappings: MappingInput[];
  salesContainers: BulkContainerInput[];
  setComponents?: SetComponentInput[];
};

/**
 * 단품(또는 벌크) 한 건의 공급자 기반 unitCost 계산.
 * 매핑이 없으면 null 반환.
 */
export function computeBaseUnitCost(p: {
  productMappings: MappingInput[];
  salesContainers: BulkContainerInput[];
  isBulk: boolean;
}): number | null {
  const firstMapping = p.productMappings[0];
  if (firstMapping) {
    const sp = firstMapping.supplierProduct;
    return computeUnitCost({
      unitPrice: num(sp.unitPrice),
      conversionRate: num(firstMapping.conversionRate) || 1,
      incomingCosts: sp.incomingCosts.map((c) => ({
        costType: c.costType as "FIXED" | "PERCENTAGE",
        value: num(c.value),
        isTaxable: c.isTaxable,
      })),
    });
  }
  // 벌크 SKU 는 자체 매핑 없음 — 판매용기(병)의 매핑에서 containerSize 로 환산
  if (p.isBulk && p.salesContainers[0]) {
    const container = p.salesContainers[0];
    const cs = num(container.containerSize);
    const cMapping = container.productMappings[0];
    if (cMapping && cs > 0) {
      const sp = cMapping.supplierProduct;
      const containerUnitCost = computeUnitCost({
        unitPrice: num(sp.unitPrice),
        conversionRate: num(cMapping.conversionRate) || 1,
        incomingCosts: sp.incomingCosts.map((c) => ({
          costType: c.costType as "FIXED" | "PERCENTAGE",
          value: num(c.value),
          isTaxable: c.isTaxable,
        })),
      });
      return containerUnitCost / cs;
    }
  }
  return null;
}

/**
 * 조립/세트 상품의 unitCost — 구성품 unitCost × quantity 의 합.
 * 구성품 중 하나라도 unitCost 가 null 이면 그 비중을 제외하지 않고 0 으로 처리.
 * (= 알려진 만큼만 합산). 모든 구성품이 unknown 이면 null 반환.
 */
export function computeAssemblyUnitCost(
  setComponents: SetComponentInput[],
  componentCostById: Map<string, number | null>,
): number | null {
  if (setComponents.length === 0) return null;
  let total = 0;
  let knownCount = 0;
  for (const sc of setComponents) {
    const c = componentCostById.get(sc.componentId);
    const qty = num(sc.quantity);
    if (c !== null && c !== undefined) {
      total += c * qty;
      knownCount += 1;
    }
  }
  if (knownCount === 0) return null;
  return total;
}

const isAssemblyLike = (p: { productType: string; isSet: boolean }): boolean =>
  p.productType === "ASSEMBLED" || p.isSet;

/**
 * 알림 임계: ₩1 미만 차이는 무시 (환산 소수점 오차 노이즈 회피).
 */
const ALERT_THRESHOLD_KRW = 1;

export type CostAlert = {
  direction: "up" | "down";
  oldCost: number;
  newCost: number;
  changeAmount: number;
  changePercent: number;
};

export function deriveCostAlert(args: {
  currentUnitCost: number | null;
  acknowledgedUnitCost: DecimalLike;
}): CostAlert | null {
  if (args.currentUnitCost === null) return null;
  if (args.acknowledgedUnitCost === null || args.acknowledgedUnitCost === undefined) return null;
  const ack = num(args.acknowledgedUnitCost);
  if (ack <= 0) return null; // 초기 미설정 → 알림 없음
  const cur = args.currentUnitCost;
  const diff = cur - ack;
  if (Math.abs(diff) < ALERT_THRESHOLD_KRW) return null;
  const pct = (diff / ack) * 100;
  return {
    direction: diff > 0 ? "up" : "down",
    oldCost: ack,
    newCost: cur,
    changeAmount: diff,
    changePercent: Math.round(pct * 100) / 100,
  };
}

export { isAssemblyLike };

const productCostInclude = {
  productMappings: {
    include: {
      supplierProduct: {
        select: {
          unitPrice: true,
          incomingCosts: {
            where: { isActive: true },
            select: { costType: true, value: true, isTaxable: true },
          },
        },
      },
    },
  },
  salesContainers: {
    where: { isActive: true },
    take: 1,
    select: {
      containerSize: true,
      productMappings: {
        include: {
          supplierProduct: {
            select: {
              unitPrice: true,
              incomingCosts: {
                where: { isActive: true },
                select: { costType: true, value: true, isTaxable: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

/**
 * 한 판매상품의 현재 supplier-base unitCost 를 DB 에서 직접 계산.
 * 매핑 변동/PUT 등에서 acknowledgedUnitCost 동기화에 사용.
 *
 * 깊이 N 의 sub-assembly 도 재귀 처리 (조립 → 조립 → 조립 …) — 메모이제이션 + 순환 가드.
 */
export async function computeCurrentUnitCostForId(
  db: PrismaLike,
  productId: string,
  options?: { memo?: Map<string, number | null>; visiting?: Set<string> },
): Promise<number | null> {
  const memo = options?.memo ?? new Map<string, number | null>();
  const visiting = options?.visiting ?? new Set<string>();
  if (memo.has(productId)) return memo.get(productId)!;
  if (visiting.has(productId)) {
    // 순환 — 0 으로 끊어 무한루프 방지 (실제로는 BOM 정의 오류)
    return null;
  }
  visiting.add(productId);

  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      productType: true,
      isSet: true,
      isBulk: true,
      setComponents: { select: { componentId: true, quantity: true } },
      ...productCostInclude,
    },
  });
  if (!product) {
    visiting.delete(productId);
    memo.set(productId, null);
    return null;
  }

  const baseCost = computeBaseUnitCost({
    productMappings: product.productMappings,
    salesContainers: product.salesContainers,
    isBulk: product.isBulk,
  });

  if (
    !isAssemblyLike({ productType: product.productType, isSet: product.isSet }) ||
    product.setComponents.length === 0
  ) {
    visiting.delete(productId);
    memo.set(productId, baseCost);
    return baseCost;
  }

  // 조립인데 자체 매핑이 있으면 baseCost 우선 (기존 list API 동작과 일치)
  if (baseCost !== null) {
    visiting.delete(productId);
    memo.set(productId, baseCost);
    return baseCost;
  }

  // 자식들 cost 재귀 계산 — 자식도 조립이면 그 자식의 setComponents 까지 들어감
  const costById = new Map<string, number | null>();
  for (const sc of product.setComponents) {
    const childCost = await computeCurrentUnitCostForId(db, sc.componentId, { memo, visiting });
    costById.set(sc.componentId, childCost);
  }
  const assemblyCost = computeAssemblyUnitCost(product.setComponents, costById);
  visiting.delete(productId);
  memo.set(productId, assemblyCost);
  return assemblyCost;
}
