export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "PREPARING_PACKED"
  | "SHIPPED"
  | "COMPLETED"
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "RETURN_COLLECTED"
  | "RETURN_INSPECTED"
  | "CANCELLED"
  | "RETURNED"
  | "EXCHANGED";

/** 결제 축 — 출고(OrderStatus) 와 별개 */
export type OrderPaymentStatus =
  | "UNPAID"
  | "PAID"
  | "REFUND_PENDING"
  | "PARTIAL_REFUND"
  | "REFUNDED"
  | "SALES_CANCELLED";

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
  claimType: OrderClaimType | null;
  /** 이 주문이 다른 주문의 교환 새 주문인지 식별 (-EX 색·배지 분기용) */
  exchangedFromOrders?: Array<{ id: string }>;
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

/**
 * 상태 라벨 — 정적 매핑.
 * 단계별 라벨이지만 일부는 컨텍스트(channelId, claimType) 에 따라 동적으로 다른 라벨이 적용됨.
 *  - PENDING: channelId 있으면 "주문" (외부), 없으면 "접수" (매장) — `statusLabel()` 사용
 *  - RETURN_*: claimType 이 EXCHANGE_* 이면 "교환 ..." (예: 교환요청), REFUND 면 "반품 ..." — `statusLabel()` 사용
 */
const STATUS_LABEL_DEFAULTS: Record<OrderStatus, string> = {
  PENDING: "주문",
  PREPARING: "출고대기",
  PREPARING_PACKED: "출고확정",
  SHIPPED: "배송중",
  COMPLETED: "배송완료",
  RETURN_REQUESTED: "반품요청",
  RETURN_ACCEPTED: "반품 회수대기",
  RETURN_COLLECTED: "회수완료",
  RETURN_INSPECTED: "검수완료",
  CANCELLED: "취소",
  RETURNED: "반품완료",
  EXCHANGED: "교환완료",
};

/** 출고 정적 호환성용 — 단순 매핑이 필요한 곳 (이전 import 호환) */
export const STATUS_LABELS = STATUS_LABEL_DEFAULTS;

/**
 * 컨텍스트 인지 라벨.
 *  - PENDING: channelId 있으면 "주문", 없으면 "접수"
 *  - RETURN_REQUESTED + EXCHANGE_*: "교환요청"
 *  - RETURN_ACCEPTED + EXCHANGE_*: "교환 회수대기"
 *  - 그 외 RETURN_*: 기본 라벨 ("반품...")
 */
export function statusLabel(
  status: OrderStatus,
  ctx: {
    channelId?: string | null;
    claimType?: OrderClaimType | null;
  } = {},
): string {
  if (status === "PENDING") {
    return ctx.channelId ? "주문" : "접수";
  }
  const isExchangeClaim =
    ctx.claimType === "EXCHANGE_SAME" || ctx.claimType === "EXCHANGE_DIFFERENT";
  if (isExchangeClaim) {
    if (status === "RETURN_REQUESTED") return "교환요청";
    if (status === "RETURN_ACCEPTED") return "교환 회수대기";
    if (status === "RETURN_COLLECTED") return "교환 회수완료";
    if (status === "RETURN_INSPECTED") return "교환 검수완료";
  }
  return STATUS_LABEL_DEFAULTS[status];
}

export const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: "외상",
  PAID: "결제완료",
  REFUND_PENDING: "환불진행",
  PARTIAL_REFUND: "부분환불",
  REFUNDED: "환불완료",
  SALES_CANCELLED: "매출취소",
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
 * 출고/반품/교환 흐름의 가장 흔한 다음 단계만 노출.
 * 분기(반려, 즉시반품 등)는 상세 시트에서. */
export type WorkboardAction =
  | "prepare"
  | "pack"
  | "ship"
  | "complete"
  | "accept_return"
  | "collect_return"
  | "inspect_return"
  | "refund"
  | "exchange";

export function nextActionFor(
  status: OrderStatus,
  claimType?: OrderClaimType | null,
): { action: WorkboardAction; label: string } | null {
  switch (status) {
    case "PENDING":
      return { action: "prepare", label: "출고대기" };
    case "PREPARING":
      return { action: "pack", label: "출고확정" };
    case "PREPARING_PACKED":
      return { action: "ship", label: "발송" };
    case "SHIPPED":
      return { action: "complete", label: "배송완료" };
    case "RETURN_REQUESTED":
      return { action: "accept_return", label: "수락" };
    case "RETURN_ACCEPTED":
      return { action: "collect_return", label: "회수완료" };
    case "RETURN_COLLECTED":
      return { action: "inspect_return", label: "검수완료" };
    case "RETURN_INSPECTED":
      // 검수 후 — claimType 으로 환불/교환 분기. 워크보드 행은 가장 흔한 환불 노출.
      if (
        claimType === "EXCHANGE_SAME" ||
        claimType === "EXCHANGE_DIFFERENT"
      ) {
        return { action: "exchange", label: "교환완료" };
      }
      return { action: "refund", label: "반품완료" };
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
    meaning: "주문/접수 — 재고는 아직 차감되지 않음",
    nextHint: "출고대기로 진입하면 재고가 차감됩니다",
  },
  PREPARING: {
    meaning: "출고대기 — 재고 차감됨, 포장·송장 발급 대기",
    nextHint: "포장·송장 입력 완료 후 출고확정",
  },
  PREPARING_PACKED: {
    meaning: "출고확정 — 포장·송장 완료, 발송 직전 (취소 불가)",
    nextHint: "택배 인계 시 발송 처리",
  },
  SHIPPED: {
    meaning: "배송중 — 택배사 인계, 손님 인도 대기",
    nextHint: "손님 인도 확인 후 배송완료",
  },
  COMPLETED: {
    meaning: "배송완료 — 인도 종결",
    nextHint: "필요 시 반품/교환 요청으로 클레임 절차 시작",
  },
  RETURN_REQUESTED: {
    meaning: "클레임 요청 — 매장 수락/반려 결정 대기 (claimType 으로 반품/교환 분기)",
    nextHint: "사유 확인 후 수락 또는 반려",
  },
  RETURN_ACCEPTED: {
    meaning: "수락됨 — 회수 대기 (재고·환불 미진행)",
    nextHint: "물품 도착 시 회수완료 처리",
  },
  RETURN_COLLECTED: {
    meaning: "회수완료 — 검수 대기",
    nextHint: "검수 후 검수완료 처리 (불량 시 반려 가능)",
  },
  RETURN_INSPECTED: {
    meaning: "검수완료 — 환불 또는 교환 종결로 진행",
    nextHint: "claimType 따라 환불(REFUND) 또는 교환(EXCHANGE_*) 처리",
  },
  CANCELLED: {
    meaning: "주문 취소 — 재고 복원, 결제건은 환불(SALES_CANCELLED 가능)",
    nextHint: null,
  },
  RETURNED: {
    meaning: "반품완료 — 재고 복원, 환불 완료",
    nextHint: null,
  },
  EXCHANGED: {
    meaning: "교환완료 — 재고 복원, 새 주문(-EX) 자동 생성",
    nextHint: null,
  },
};
