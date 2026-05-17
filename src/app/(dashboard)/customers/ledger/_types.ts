export type LedgerType = "SALE" | "RECEIPT" | "ADJUSTMENT" | "REFUND";

/** 가상 행 타입 — CustomerRefund 레코드를 같은 테이블에 표시할 때 사용. 잔액에는 영향 없음. */
export type RowType = LedgerType | "REFUND_LOG";

export const TYPE_LABELS: Record<RowType, string> = {
  SALE: "매출",
  RECEIPT: "수금",
  ADJUSTMENT: "조정",
  REFUND: "환불",
  REFUND_LOG: "환불내역",
};

export const TYPE_JM_VARIANTS: Record<
  RowType,
  "default" | "info" | "success" | "warning" | "danger" | "accent"
> = {
  SALE: "info",
  RECEIPT: "success",
  ADJUSTMENT: "default",
  REFUND: "danger",
  REFUND_LOG: "danger",
};

export const ALL_TYPES: LedgerType[] = ["SALE", "RECEIPT", "ADJUSTMENT", "REFUND"];

export const REFUND_METHOD_LABELS: Record<string, string> = {
  CARD_CANCEL: "카드 취소",
  CASH: "현금",
  BANK_TRANSFER: "계좌이체",
  POINTS: "포인트",
  OTHER: "기타",
};

export type PaymentKind = "MIXED" | "SUPPLY_ONLY" | "VAT_ONLY";

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  MIXED: "전체",
  SUPPLY_ONLY: "공급가액만",
  VAT_ONLY: "부가세만",
};

export interface LedgerEntry {
  id: string;
  date: string;
  type: RowType;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  referenceId: string | null;
  referenceType: string | null;
  paymentKind: PaymentKind | null;
  customer: { id: string; name: string };
}

export interface RefundLog {
  id: string;
  refundedAt: string;
  amount: string;
  method: keyof typeof REFUND_METHOD_LABELS;
  memo: string | null;
  customer: { id: string; name: string };
  order: { id: string; orderNo: string };
}

export interface CustomerSummary {
  customerId: string;
  customerName: string;
  customerType?: "INDIVIDUAL" | "BUSINESS";
  currentBalance: number;
  openingBalance: number;
  totalSale: number;
  totalReceipt: number;
  totalAdjustment: number;
  totalRefund: number;
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  refunds: RefundLog[];
  customerSummaries: CustomerSummary[];
}

export type DatePreset = "thisMonth" | "lastMonth" | "last3" | "all";
