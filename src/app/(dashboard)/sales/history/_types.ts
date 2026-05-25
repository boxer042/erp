import type {
  OrderClaimReason,
  OrderClaimType,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
} from "@prisma/client";

export type SalesType = "product" | "repair" | "rental";

export type SalesStatusGroup =
  | "all"
  | "in_progress"
  | "confirmed"
  | "claim"
  | "terminal";

export type SalesSortKey =
  | "date_desc"
  | "date_asc"
  | "amount_desc"
  | "amount_asc"
  | "type";

export type RangePreset =
  | "ALL"
  | "TODAY"
  | "THIS_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "LAST_3M"
  | "THIS_YEAR"
  | "CUSTOM";

/** orphan repair=PICKED_UP, orphan rental=RETURNED 도 같은 유니언으로 표현 */
export type SalesRowStatus = OrderStatus | "PICKED_UP";

export interface SalesHistoryRow {
  id: string;
  type: SalesType;
  refNo: string;
  channelOrderNo: string | null;
  date: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channelId: string | null;
  channelName: string | null;
  paymentMethod: OrderPaymentMethod | null;
  paymentStatus: OrderPaymentStatus;
  status: SalesRowStatus;
  claimType: OrderClaimType | null;
  claimReason: OrderClaimReason | null;
  fulfillmentType:
    | "IN_STORE"
    | "PICKUP"
    | "DELIVERY"
    | "QUICK"
    | "SHIPPING"
    | null;
  amount: number;
  netAmount: number;
  /** 손님 청구 배송비 (세전). orphan 은 0 */
  shippingFee: number;
  /** 매장 부담 배송 원가 (세전). orphan 은 0 */
  shippingCostBorne: number;
  isExchangeReplacement: boolean;
  /** 수리·임대 결제에 섞여 들어온 추가구매 라인 수. 0 이면 순수 수리/임대. */
  extraSalesCount: number;
  /** 추가구매 라인 합계 (세전). */
  extraSalesAmount: number;
  /** 수리 작업 성격 — type=repair 일 때만 의미. CUSTOM_BUILD 면 "리빌드" 라벨. */
  repairWorkKind: "REPAIR" | "CUSTOM_BUILD" | null;
  sourceId: string;
  isOrphan: boolean;
}

export interface SalesHistorySummary {
  totalCount: number;
  totalAmount: number;
  netAmount: number;
  refundedAmount: number;
  unpaidAmount: number;
  claimInProgressCount: number;
  byType: {
    product: { count: number; amount: number };
    repair: { count: number; amount: number };
    rental: { count: number; amount: number };
  };
  byChannel: Array<{
    channelId: string | null;
    channelName: string;
    count: number;
    amount: number;
  }>;
  truncated: boolean;
}

export interface SalesHistoryResponse {
  rows: SalesHistoryRow[];
  summary: SalesHistorySummary;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export interface CustomerOption {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  type?: string;
}

export interface ChannelOption {
  id: string;
  name: string;
  code: string;
}

export const TYPE_LABEL: Record<SalesType, string> = {
  product: "판매",
  repair: "수리",
  rental: "임대",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

export const STATUS_GROUP_LABEL: Record<SalesStatusGroup, string> = {
  all: "전체",
  in_progress: "진행중",
  confirmed: "배송완료",
  claim: "클레임",
  terminal: "반품·교환",
};

export const SORT_OPTIONS: { value: SalesSortKey; label: string }[] = [
  { value: "date_desc", label: "최신순" },
  { value: "date_asc", label: "오래된순" },
  { value: "amount_desc", label: "금액 높은순" },
  { value: "amount_asc", label: "금액 낮은순" },
  { value: "type", label: "타입순" },
];

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "TODAY", label: "오늘" },
  { value: "THIS_WEEK", label: "이번주" },
  { value: "THIS_MONTH", label: "이번달" },
  { value: "LAST_MONTH", label: "지난달" },
  { value: "LAST_3M", label: "3개월" },
  { value: "THIS_YEAR", label: "올해" },
  { value: "CUSTOM", label: "직접" },
];
