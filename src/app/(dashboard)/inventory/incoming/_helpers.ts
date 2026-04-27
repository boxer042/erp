// 단가 기준 단위 할인 계산 — "10%" → 단가의 10%, "3000" → 3,000원
export function calcDiscountPerUnit(unitPrice: number, discount: string): number {
  if (!discount || discount === "0") return 0;
  const trimmed = discount.trim();
  if (trimmed.endsWith("%")) {
    const pct = parseFloat(trimmed.replace("%", "")) || 0;
    return Math.round(unitPrice * pct / 100);
  }
  return parseFloat(trimmed) || 0;
}

export const statusLabels: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확인",
  CANCELLED: "취소",
};

export const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "warning" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "destructive",
};

export const shippingToSupply = (total: string, isTaxable: boolean) => {
  const n = parseFloat(total || "0");
  if (!n) return "";
  return String(isTaxable ? Math.round(n / 1.1) : n);
};

export const shippingToTotal = (supply: string, isTaxable: boolean) => {
  const n = parseFloat(supply || "0");
  if (!n) return "";
  return String(isTaxable ? n + Math.round(n * 0.1) : n);
};
