export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNED";

export type FulfillmentType = "PICKUP" | "DELIVERY" | "SHIPPING";

export type BoardGroupKey =
  | "overdue"
  | "today"
  | "unscheduled"
  | "shipped"
  | "thisWeek"
  | "future";

export interface OrderListItem {
  id: string;
  orderNo: string;
  channelOrderNo: string | null;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  expectedShipDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  orderDate: string;
  subtotalAmount: string;
  totalAmount: string;
  commissionAmount: string;
  channel: { name: string; code: string } | null;
  createdBy: { name: string };
  repairTicket: { id: string; ticketNo: string; status: string } | null;
  items: Array<{
    id: string;
    quantity: string;
    product: { name: string } | null;
    serviceName: string | null;
  }>;
  _count: { items: number };
}

export interface BoardResponse {
  groups: Record<BoardGroupKey, OrderListItem[]>;
  today: string;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "접수",
  PREPARING: "준비",
  SHIPPED: "발송",
  COMPLETED: "완료",
  CANCELLED: "취소",
  RETURNED: "반품",
};

export const STATUS_VARIANTS: Record<
  OrderStatus,
  "default" | "secondary" | "destructive" | "outline" | "warning" | "success"
> = {
  PENDING: "warning",
  PREPARING: "secondary",
  SHIPPED: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
  RETURNED: "outline",
};

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  PICKUP: "매장 수령",
  DELIVERY: "배달",
  SHIPPING: "택배",
};

export const BOARD_SECTION_TITLES: Record<BoardGroupKey, string> = {
  overdue: "지연",
  today: "오늘 출고",
  unscheduled: "예정일 미정",
  shipped: "발송 중",
  thisWeek: "이번 주",
  future: "이후",
};

/** 카드에 보일 다음 액션 — null 이면 액션 버튼 없음 */
export function nextActionFor(status: OrderStatus): {
  action: "prepare" | "ship" | "complete";
  label: string;
} | null {
  switch (status) {
    case "PENDING":
      return { action: "prepare", label: "준비 시작" };
    case "PREPARING":
      return { action: "ship", label: "발송" };
    case "SHIPPED":
      return { action: "complete", label: "완료" };
    default:
      return null;
  }
}
