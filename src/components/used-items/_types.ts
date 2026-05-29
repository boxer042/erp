// UsedItem 도메인 공용 타입·라벨·헬퍼
// API 응답 type narrow + UI 라벨 매핑.

export type UsedItemSource =
  | "PURCHASED"
  | "SCAVENGED"
  | "RENTAL_RETIREMENT"
  | "EMERGENCY_USE";

export type UsedItemStatus =
  | "IN_STOCK"
  | "ASSEMBLED_INTO"
  | "SOLD"
  | "SCRAPPED";

export type UsedItemCostType = "PART" | "LABOR" | "OTHER";

export const USED_ITEM_SOURCE_LABEL: Record<UsedItemSource, string> = {
  PURCHASED: "매입",
  SCAVENGED: "버려진 부속",
  RENTAL_RETIREMENT: "임대 종료",
  EMERGENCY_USE: "급매(사후 정리)",
};

export const USED_ITEM_STATUS_LABEL: Record<UsedItemStatus, string> = {
  IN_STOCK: "보관 중",
  ASSEMBLED_INTO: "조립에 흡수",
  SOLD: "판매 완료",
  SCRAPPED: "폐기",
};

export const USED_ITEM_COST_TYPE_LABEL: Record<UsedItemCostType, string> = {
  PART: "부품",
  LABOR: "공임",
  OTHER: "기타",
};

// API 응답 — list/detail 공용 (필드는 endpoint 별로 일부 다름)
export interface UsedItemListRow {
  id: string;
  internalCode: string;
  displayName: string;
  productId: string | null;
  product?: { id: string; name: string; sku: string } | null;
  acquiredFrom: UsedItemSource;
  acquiredCost: string;
  isAcquiredTaxable: boolean;
  acquiredAt: string;
  sourceCustomerId: string | null;
  sourceCustomer?: { id: string; name: string } | null;
  sourceMemo: string | null;
  status: UsedItemStatus;
  spec: string | null;
  imageUrls: string[] | null;
  memo: string | null;
  serialItemId: string | null;
  serialItem?: { id: string; code: string; warrantyEnds: string | null } | null;
  createdAt: string;
}

export interface UsedItemCost {
  id: string;
  usedItemId: string;
  costType: UsedItemCostType;
  amount: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface UsedItemDetail extends UsedItemListRow {
  sourceCustomer?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  serialItem?: {
    id: string;
    code: string;
    warrantyEnds: string | null;
    customerId: string | null;
    orderItemId: string | null;
    status: string;
  } | null;
  addedCosts: UsedItemCost[];
  orderItem?: {
    id: string;
    orderId: string;
    order: { orderNo: string };
  } | null;
  rentalAsset?: {
    id: string;
    assetNo: string;
    name: string;
  } | null;
  assemblyConsumption?: {
    id: string;
    costSnapshot: string;
    assembly: {
      id: string;
      assemblyNo: string;
      assembledAt: string;
    };
  } | null;
}

/** 누적 비용 = 매입가 + Σ addedCosts.amount */
export function totalUsedItemCost(item: {
  acquiredCost: string;
  addedCosts?: Array<{ amount: string }>;
}): number {
  const base = parseFloat(item.acquiredCost) || 0;
  const added = (item.addedCosts ?? []).reduce(
    (sum, c) => sum + (parseFloat(c.amount) || 0),
    0,
  );
  return base + added;
}

/** 보관 일수 — acquiredAt 부터 현재까지 (정수일) */
export function daysInStock(acquiredAt: string): number {
  const ms = Date.now() - new Date(acquiredAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * 표시용 이름 — 카탈로그 매칭이면 product.name(live) 우선, 아니면 displayName(스냅샷/비카탈로그).
 * 카탈로그 상품명이 바뀌면 매칭된 중고 이름도 자동으로 따라감 (옵션 B).
 * product 가 null(미include 또는 삭제)이면 displayName 폴백.
 */
export function usedItemName(u: {
  displayName: string;
  product?: { name: string } | null;
}): string {
  return u.product?.name ?? u.displayName;
}
