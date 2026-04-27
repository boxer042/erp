export const CATEGORY_LABELS: Record<string, string> = {
  SHIPPING: "택배비",
  RENT: "임대료",
  UTILITIES: "공과금",
  SALARY: "인건비",
  PACKAGING: "포장재",
  OFFICE_SUPPLIES: "사무소모품",
  MARKETING: "광고·판촉",
  MAINTENANCE: "수리·유지보수",
  INVENTORY_USAGE: "내 상품 사용",
  OTHER: "기타",
};

export const USAGE_REASONS = ["SAMPLE", "SELF_USE", "DAMAGE", "LOSS", "SUPPLIES"] as const;
export type UsageReasonKey = (typeof USAGE_REASONS)[number];

export const REASON_LABELS: Record<UsageReasonKey, string> = {
  SAMPLE: "샘플",
  SELF_USE: "자가소비",
  DAMAGE: "파손",
  LOSS: "분실",
  SUPPLIES: "소모품",
};

export const TARGET_REQUIRED_REASONS: UsageReasonKey[] = ["SAMPLE"];

export const CATEGORIES = Object.keys(CATEGORY_LABELS);

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
};

export const statusLabels: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확인",
  CANCELLED: "취소",
};

export const statusVariants: Record<string, "outline" | "default" | "secondary" | "destructive" | "warning" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  CANCELLED: "destructive",
};

export const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  amount: "",
  category: "OTHER",
  description: "",
  memo: "",
  isTaxable: true,
  supplierId: "",
  attachmentUrl: "" as string,
  attachmentPath: "" as string,
  attachmentName: "" as string,
  paymentMethod: "" as string,
  recoverable: false,
};

export function formatPrice(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export interface Expense {
  id: string;
  date: string;
  amount: string;
  category: string;
  description: string;
  isTaxable: boolean;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  referenceId: string | null;
  referenceType: string | null;
  memo: string | null;
  attachmentUrl: string | null;
  attachmentPath: string | null;
  attachmentName: string | null;
  paymentMethod: string | null;
  recoverable: boolean;
}

export interface Summary {
  category: string;
  label: string;
  total: number;
  recoverable: number;
  net: number;
}

export interface PeriodTotals {
  all: number;
  recoverable: number;
  net: number;
}

export interface IncomingOption {
  id: string;
  incomingNo: string;
  incomingDate: string;
  supplierName: string;
  shippingCost: string;
}

export interface IncomingDetail {
  id: string;
  incomingNo: string;
  status: string;
  incomingDate: string;
  totalAmount: string;
  shippingCost: string;
  shippingIsTaxable: boolean;
  shippingDeducted: boolean;
  memo: string | null;
  supplier: { name: string };
  createdBy: { name: string };
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    originalPrice: string | null;
    discountAmount: string | null;
    totalPrice: string;
    supplierProduct: {
      name: string;
      supplierCode: string | null;
      unitOfMeasure: string;
    };
  }>;
}
