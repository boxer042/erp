import type { ProductDetail, SellingCostItem } from "./types";

// 라벨 매핑
export const TAX_TYPE_LABELS: Record<string, string> = {
  TAXABLE: "과세",
  TAX_FREE: "면세",
  ZERO_RATE: "과세, 영세율",
};

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  FINISHED: "완제품",
  PARTS: "부품",
  SET: "세트",
  ASSEMBLED: "조립",
};

export const LOT_SOURCE_LABELS: Record<string, string> = {
  INCOMING: "입고",
  INITIAL: "기초",
  ADJUSTMENT: "조정",
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  INCOMING: "입고",
  OUTGOING: "출고",
  ADJUSTMENT_PLUS: "조정+",
  ADJUSTMENT_MINUS: "조정-",
  SET_CONSUME: "세트소진",
  SET_PRODUCE: "세트생산",
  RETURN: "반품",
  INITIAL: "기초",
  STOCKTAKE_PLUS: "실사+",
  STOCKTAKE_MINUS: "실사-",
  INTERNAL_USE: "사내사용",
  BOTTLE_OPEN_OUT: "벌크개봉출",
  BOTTLE_OPEN_IN: "벌크개봉입",
};

// 숫자/통화 포맷
export const fmtPrice = (n: number): string => Math.round(n).toLocaleString("ko-KR");
export const fmtNumber = (s: string | number): string =>
  parseFloat(String(s)).toLocaleString("ko-KR");

export const formatDateKo = (s: string | Date): string =>
  new Date(s).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatDateOnly = (s: string | Date): string =>
  new Date(s).toLocaleDateString("ko-KR");

// 세전 → VAT 포함 표시가
export const toVatPrice = (sp: string | number, taxType: string): number => {
  const price = parseFloat(String(sp || "0"));
  return taxType === "TAXABLE" ? Math.round(price * 1.1) : Math.round(price);
};

// 판매비용 합계 (FIXED는 isTaxable이면 /1.1로 공급가액 환산, PERCENTAGE는 basePrice 비율)
export const computeCostSum = (list: SellingCostItem[], basePrice: number): number =>
  list.reduce((sum, c) => {
    const v = parseFloat(c.value || "0");
    if (c.costType === "FIXED") return sum + (c.isTaxable ? v / 1.1 : v);
    return sum + (basePrice * v) / 100;
  }, 0);

// 채널 비용 인라인 요약 (예: "택배비 ₩3,000 + 수수료 5%")
export const summarizeCosts = (list: SellingCostItem[], max = 3): string => {
  if (list.length === 0) return "—";
  const parts = list.slice(0, max).map((c) => {
    const v =
      c.costType === "FIXED"
        ? `₩${fmtNumber(c.value)}`
        : `${c.value}%`;
    return `${c.name} ${v}`;
  });
  if (list.length > max) parts.push(`외 ${list.length - max}건`);
  return parts.join(" + ");
};

export const costTypeLabel = (t: string): string =>
  t === "FIXED" ? "고정" : t === "PERCENTAGE" ? "비율(%)" : t;

/**
 * 잔여 InventoryLot 의 가중평균 unitCost (세전, 배송비·입고비용 포함된 스냅샷).
 * 잔여 로트가 없으면 매핑된 공급단가 / conversionRate 로 폴백.
 *
 * KPI 입고가 카드와 채널별 가격 표의 오프라인 가상 행 마진에서 공통 사용.
 */
export function computeAvgInboundUnitCost(product: ProductDetail): number {
  const lots = product.inventoryLots ?? [];
  let totalQty = 0;
  let totalValue = 0;
  for (const lot of lots) {
    const remain = parseFloat(lot.remainingQty);
    const unit = parseFloat(lot.unitCost);
    if (remain <= 0) continue;
    totalQty += remain;
    totalValue += remain * unit;
  }
  if (totalQty > 0) return totalValue / totalQty;
  const m = product.productMappings?.[0];
  if (m) {
    return (
      parseFloat(m.supplierProduct.unitPrice) / parseFloat(m.conversionRate || "1")
    );
  }
  return 0;
}
