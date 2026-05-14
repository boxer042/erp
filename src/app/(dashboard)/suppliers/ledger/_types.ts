export type LedgerType = "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";

export const TYPE_LABELS: Record<LedgerType, string> = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  ADJUSTMENT: "조정",
  REFUND: "환급",
};

export const TYPE_JM_VARIANTS: Record<
  LedgerType,
  "default" | "info" | "success" | "warning" | "danger" | "accent"
> = {
  PURCHASE: "info",
  PAYMENT: "success",
  ADJUSTMENT: "default",
  REFUND: "danger",
};

export const ALL_TYPES: LedgerType[] = [
  "PURCHASE",
  "PAYMENT",
  "ADJUSTMENT",
  "REFUND",
];

export interface LedgerEntry {
  id: string;
  date: string;
  createdAt: string;
  type: LedgerType;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  referenceId: string | null;
  referenceType: string | null;
  supplier: { id: string; name: string };
}

export interface SupplierSummary {
  supplierId: string;
  supplierName: string;
  currentBalance: number;
  openingBalance: number;
  totalPurchase: number;
  totalPayment: number;
  totalAdjustment: number;
  totalRefund: number;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  supplierSummaries: SupplierSummary[];
}

export interface LedgerItem {
  id: string;
  incomingId: string;
  incomingNo: string;
  incomingDate: string;
  supplier: { id: string; name: string };
  supplierProduct: {
    id: string;
    name: string;
    spec: string | null;
    supplierCode: string | null;
    unitOfMeasure: string;
    isTaxable: boolean;
    mapped: boolean;
  };
  quantity: string;
  originalPrice: string | null;
  discountAmount: string | null;
  unitPrice: string;
  totalPrice: string;
  memo: string | null;
}

export type ViewMode = "ledger" | "items";

export type DatePreset = "thisMonth" | "lastMonth" | "last3" | "all";

/** 품목별 뷰의 한 행 — 매입 품목 또는 결제/조정/환급 한 줄 */
export type ItemViewRow =
  | { kind: "item"; data: LedgerItem; isLastInGroup: boolean; balance: number | null }
  | { kind: "payment"; data: LedgerEntry };
