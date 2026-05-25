/** YYYY-MM-DD ↔ Date — 타임존 시프트 회피용 로컬 일자 변환 */
export function parseYmd(s: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function formatYmd(d?: Date): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ChannelOption {
  id: string;
  name: string;
  code: string;
  commissionRate: string;
}

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  type: "INDIVIDUAL" | "BUSINESS";
  businessNumber: string | null;
  shippingAddress: string | null;
  address: string | null;
}

export interface CategoryRoot {
  id: string;
  name: string;
  imageUrl: string | null;
}

/** 변형 픽업 다이얼로그가 반환하는 결과 — 부모는 이걸로 카트 라인 1개 추가 */
export interface PickedVariant {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  imageUrl: string | null;
}

export interface VariantDetail {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  imageUrl?: string | null;
  variableComponents?: { slotLabel: string; componentName: string }[];
}
