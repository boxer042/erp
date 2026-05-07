export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "SHIPPED"
  | "COMPLETED"
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "CANCELLED"
  | "RETURNED"
  | "EXCHANGED";

/** 결제 축 — 출고(OrderStatus) 와 별개 */
export type OrderPaymentStatus =
  | "UNPAID"
  | "PAID"
  | "PARTIAL_REFUND"
  | "REFUNDED";

/** 클레임 분기 — 손님이 원하는 결과 */
export type OrderClaimType =
  | "REFUND"
  | "EXCHANGE_SAME"
  | "EXCHANGE_DIFFERENT";

/** 클레임 사유 — 책임 소재 */
export type OrderClaimReason =
  | "DEFECTIVE"
  | "DAMAGED_IN_TRANSIT"
  | "WRONG_ITEM"
  | "CHANGE_MIND"
  | "SIZE_COLOR"
  | "OTHER";

export type FulfillmentType = "PICKUP" | "DELIVERY" | "SHIPPING";

export type BoardGroupKey =
  | "overdue"
  | "today"
  | "unscheduled"
  | "shipped"
  | "thisWeek"
  | "future"
  | "returnPending";

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
  paymentMethod: string | null;
  paymentStatus: OrderPaymentStatus;
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

export interface ChannelOption {
  id: string;
  name: string;
  code: string;
}

export interface BoardResponse {
  groups: Record<BoardGroupKey, OrderListItem[]>;
  today: string;
  channels: ChannelOption[];
}

/** 채널 필터 — 오프라인(channelId=null) / 외부 채널(<id>) / 전체 */
export type ChannelFilter = "all" | "offline" | string;

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "접수",
  PREPARING: "준비",
  SHIPPED: "발송",
  COMPLETED: "완료",
  RETURN_REQUESTED: "반품 요청",
  RETURN_ACCEPTED: "회수 대기",
  CANCELLED: "취소",
  RETURNED: "반품",
  EXCHANGED: "교환",
};

export const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: "외상",
  PAID: "결제완료",
  PARTIAL_REFUND: "부분환불",
  REFUNDED: "환불완료",
};

export const CLAIM_TYPE_LABELS: Record<OrderClaimType, string> = {
  REFUND: "환불",
  EXCHANGE_SAME: "같은 상품 교환",
  EXCHANGE_DIFFERENT: "다른 상품 교환",
};

/** 클레임 사유 — UI 표시용 라벨. enum 값과 1:1 */
export const CLAIM_REASON_LABELS: Record<OrderClaimReason, string> = {
  DEFECTIVE: "불량/하자",
  DAMAGED_IN_TRANSIT: "배송 중 파손",
  WRONG_ITEM: "오배송",
  CHANGE_MIND: "단순 변심",
  SIZE_COLOR: "사이즈/색상 변경",
  OTHER: "기타",
};

/** 클레임 사유별 매장 책임 여부 — 운임 부담 정책에 활용 */
export const CLAIM_REASON_LIABILITY: Record<
  OrderClaimReason,
  "shop" | "customer" | "shared"
> = {
  DEFECTIVE: "shop",
  DAMAGED_IN_TRANSIT: "shop",
  WRONG_ITEM: "shop",
  CHANGE_MIND: "customer",
  SIZE_COLOR: "shared",
  OTHER: "shared",
};

export const LIABILITY_LABELS: Record<"shop" | "customer" | "shared", string> = {
  shop: "매장 부담",
  customer: "손님 부담",
  shared: "분담",
};

/** 책임에 따른 권장 운임 안내 메시지 */
export function liabilityShippingNote(
  reason: OrderClaimReason | null,
): string | null {
  if (!reason) return null;
  const liability = CLAIM_REASON_LIABILITY[reason];
  if (liability === "shop")
    return "매장 책임 사유 — 회수·재발송 운임 모두 매장 부담 권장";
  if (liability === "customer")
    return "손님 책임 사유 — 회수·재발송 운임 손님 부담 권장";
  return "협의 사유 — 운임 매장·손님 분담 권장";
}

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
  returnPending: "반품 처리",
};

/** 카드에 보일 다음 액션 — null 이면 액션 버튼 없음.
 * 출고 흐름 + 반품 처리 흐름의 가장 흔한 다음 단계만 노출.
 * 분기(반품 반려, 즉시반품 등)는 상세 시트에서. */
export function nextActionFor(status: OrderStatus): {
  action: "prepare" | "ship" | "complete" | "accept_return" | "return";
  label: string;
} | null {
  switch (status) {
    case "PENDING":
      return { action: "prepare", label: "준비 시작" };
    case "PREPARING":
      return { action: "ship", label: "발송" };
    case "SHIPPED":
      return { action: "complete", label: "완료" };
    case "RETURN_REQUESTED":
      return { action: "accept_return", label: "수락" };
    case "RETURN_ACCEPTED":
      return { action: "return", label: "회수·환불" };
    default:
      return null;
  }
}

/**
 * 상태 흐름 메타 — 각 상태의 의미와 다음에 유도하는 액션.
 *
 * 출고 축:
 *   PENDING → PREPARING (재고 차감) → SHIPPED (송장) → COMPLETED
 *
 * 반품 축 (3단계 — 손님 요청 → 매장 결정 → 회수·종결):
 *   COMPLETED → [반품 요청] → RETURN_REQUESTED
 *   RETURN_REQUESTED → [수락] → RETURN_ACCEPTED  (회수 대기)
 *                    → [반려] → COMPLETED
 *   RETURN_ACCEPTED  → [환불] → RETURNED   (재고 복원 + 환불)
 *                    → [교환] → EXCHANGED  (재고 복원 + 새 주문)
 *
 *   COMPLETED → [즉시 환불] → RETURNED  (1단계 단축, 매장 즉시 처리용)
 *
 * 취소 축:
 *   PENDING/PREPARING → [취소] → CANCELLED (재고 복원, PAID 였다면 환불)
 *
 * 결제 축은 paymentStatus 로 별도 추적 (UNPAID/PAID/PARTIAL_REFUND/REFUNDED).
 */
export const STATUS_FLOW: Record<
  OrderStatus,
  { meaning: string; nextHint: string | null }
> = {
  PENDING: {
    meaning: "접수만 된 상태 — 재고는 아직 차감되지 않음",
    nextHint: "준비를 시작하면 재고가 차감됩니다",
  },
  PREPARING: {
    meaning: "재고가 차감되어 출고 준비 중",
    nextHint: "송장 정보를 입력하고 발송하세요",
  },
  SHIPPED: {
    meaning: "택배사에 인도되어 배송 중",
    nextHint: "고객 인도 확인 후 완료 처리",
  },
  COMPLETED: {
    meaning: "고객에게 인도되어 종결됨",
    nextHint: "필요 시 반품 요청으로 회수 절차 시작",
  },
  RETURN_REQUESTED: {
    meaning: "반품 요청 접수 — 매장의 수락/반려 결정 대기",
    nextHint: "사유 확인 후 수락 또는 반려",
  },
  RETURN_ACCEPTED: {
    meaning: "반품 수락됨 — 회수 대기 (재고·환불 미진행)",
    nextHint: "회수 완료 후 환불 또는 교환으로 종결",
  },
  CANCELLED: {
    meaning: "주문이 취소됨 — 재고 복원, 결제건은 환불 완료",
    nextHint: null,
  },
  RETURNED: {
    meaning: "반품 종결 (환불) — 재고 복원, 환불 완료",
    nextHint: null,
  },
  EXCHANGED: {
    meaning: "교환 종결 — 재고 복원, 차액은 새 주문에서 정산",
    nextHint: null,
  },
};
