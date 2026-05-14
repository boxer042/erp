export type OrderStatus =
  | "PENDING"
  | "PREPARING"
  | "PREPARING_PACKED"
  | "SHIPPED"
  | "COMPLETED"
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "RETURN_PICKING"
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

export type FulfillmentType = "IN_STORE" | "PICKUP" | "DELIVERY" | "SHIPPING";

/**
 * 매장 인도 여부 — IN_STORE(즉시판매) 또는 PICKUP(픽업대기) 둘 다 손님이 매장에서 받음.
 * 배송정보(주소·수령인) 가 불필요한 모든 분기에서 사용. DELIVERY/SHIPPING 만 배송정보 필요.
 */
export function isInStoreFulfillment(
  type: FulfillmentType | null | undefined,
): boolean {
  return type === "IN_STORE" || type === "PICKUP";
}

/** OrderItem 라인 역할 — 메인/옵션/추가구매 분기 */
export type OrderItemLineRole = "MAIN" | "OPTION_REF" | "ADDON";

export type BoardGroupKey =
  | "overdue"
  | "today"
  | "unscheduled"
  | "shipped"
  | "thisWeek"
  | "future"
  | "returnPending"
  /** 종결 — COMPLETED/RETURNED/EXCHANGED/CANCELLED. 검색 시에만 server 가 포함시켜 반환 */
  | "closed";

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
  /** 배송비 결제 방식 — 워크보드 "배송비" 컬럼 / 상세 시트 표시용 */
  shippingPaymentType: "PREPAID" | "COD" | "STORE_BURDEN";
  shippingFee: string;
  /** 출고 회차 — partial_ship/ship 누적. ≥2 면 분할 발송 이력 (SHIPPED/COMPLETED 시 표시) */
  shipmentCount: number;
  claimType: OrderClaimType | null;
  /** 클레임 사유 — 반품 처리 전용 뷰에서 표시 (워크보드는 미사용) */
  claimReason?: OrderClaimReason | null;
  /** 이 주문이 다른 주문의 교환 새 주문인지 식별 (-EX 색·배지 분기용) */
  exchangedFromOrders?: Array<{ id: string }>;
  channel: { name: string; code: string } | null;
  createdBy: { name: string };
  repairTicket: { id: string; ticketNo: string; status: string } | null;
  items: Array<{
    id: string;
    quantity: string;
    shippedQty: string;
    returnedQty: string;
    unitPrice: string;
    totalPrice: string;
    /** 라인 역할 — MAIN(기본) / OPTION_REF(메인의 옵션) / ADDON(추가구매) */
    lineRole: OrderItemLineRole;
    /** 부모 라인 link (OPTION_REF/ADDON 일 때 메인 OrderItem.id 가리킴) */
    parentItemId: string | null;
    /** 주문 시점 옵션값 스냅샷 — { "메모리": "32GB" } */
    optionSnapshot: Record<string, string> | null;
    product: {
      id: string;
      name: string;
      sku: string;
      /** 대표상품(변형 부모) — true 면 PENDING 단계에서 출고 SKU 선택 강제 */
      isCanonical?: boolean;
      /** "OPTION_PARENT" 면 SWAP 옵션값으로 실제 SKU 결정 강제 */
      productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED" | "OPTION_PARENT";
    } | null;
    serviceName: string | null;
    /** 진입 경로 SKU — funnel 분석용. SWAP/cross-sell 발생 시 productId 와 다름. POS 결제는 null */
    entryProductId: string | null;
    entryProduct: { id: string; name: string; sku: string } | null;
  }>;
  _count: { items: number };
  /** 부분 출고/반품 진행 상태 — 항목 전체 합계 (분할 발송 이력 표시용 — 첫 행) */
  partialState: {
    totalQty: number;
    shippedQty: number;
    returnedQty: number;
  };
}

/**
 * 품목별 행 워크보드의 1 row 단위.
 * Order 의 items 를 평탄화 + 그룹 메타 부착.
 *
 *  - isFirstInGroup: 같은 order 의 첫 번째 행 (주문번호·고객·채널 등 표시 위치)
 *  - groupSize: 같은 order 안의 총 item 행 수 (첫 행 강조용)
 *  - groupIndex: 0-based 위치 — 좌측 indent border 그라데이션 등에 활용 가능
 */
export interface OrderItemRow {
  rowKey: string; // `${orderId}:${itemId}`
  order: OrderListItem;
  item: OrderListItem["items"][number];
  isFirstInGroup: boolean;
  groupSize: number;
  groupIndex: number;
}

/**
 * item-level 처리 상태 — Order.status + claimType + item.shippedQty/returnedQty 로 derive.
 *
 * 단계별 라벨 정책 (사용자 정의 컨벤션):
 *   출고:  접수 → 출고대기 → 출고확정 → 배송중 → 배송완료
 *           (출고대기까지 취소 가능)
 *   반품:  반품요청 → 반품 회수대기 → 회수완료 → 검수완료 → 반품완료
 *           (외상은 매출취소 SALES_CANCELLED)
 *   교환:  교환요청 → 교환 회수대기 → 교환 회수완료 → 교환 검수완료 → 교환완료
 *           (검수 후 교환완료 + 새 주문 -EX 자동 생성)
 */
export type ItemPhase =
  | "PENDING_LINE"             // 접수 — PENDING (재고 미차감, 결제 후 출고대기 진입 전)
  | "WAITING_SHIP"             // 출고대기 — PREPARING (재고 차감, 발송 시작 전)
  | "PACKED_LINE"              // 출고확정 — PREPARING_PACKED + 라인 미발송
  | "PARTIAL_SHIP"             // 부분발송 — 0 < shippedQty < quantity
  | "FULLY_SHIPPED"            // 배송중 — SHIPPED 또는 PREPARING_PACKED 라인 전량 발송
  | "DELIVERED"                // 배송완료 — COMPLETED
  | "RETURN_REQUESTED_LINE"    // 반품요청/교환요청 — RETURN_REQUESTED
  | "RETURN_ACCEPTED_LINE"     // 반품 회수대기/교환 회수대기 — RETURN_ACCEPTED
  | "RETURN_PICKING_LINE"      // 반품 회수중/교환 회수중 — RETURN_PICKING
  | "RETURN_COLLECTED_LINE"    // 회수완료/교환 회수완료 — RETURN_COLLECTED
  | "RETURN_INSPECTED_LINE"    // 검수완료/교환 검수완료 — RETURN_INSPECTED
  | "RETURNED_LINE"            // 반품완료 — RETURNED + returnedQty = quantity
  | "PARTIAL_RETURN"           // 부분반품 — COMPLETED + 0 < returnedQty < quantity
  | "EXCHANGED_LINE"           // 교환완료 — EXCHANGED + returnedQty > 0
  | "CANCELLED_LINE";          // 취소 — CANCELLED

/**
 * order.status + claimType + 라인 수량으로 item-level 단계 산출.
 *
 *  - 라인마다 진행률 다른 케이스 (네이버 스타일) 지원
 *  - 반품/교환 단계는 claimType 으로 분기 (라벨만 다름, 같은 status 위에서)
 *  - 예: PREPARING_PACKED 인데 라인 A 는 100% 발송됨, B 는 0% → A=FULLY_SHIPPED(배송중), B=PACKED_LINE(출고확정)
 */
export function deriveItemPhase(
  status: OrderStatus,
  quantity: number,
  shippedQty: number,
  returnedQty: number,
): ItemPhase {
  if (status === "CANCELLED") return "CANCELLED_LINE";
  if (status === "PENDING") return "PENDING_LINE";

  if (status === "PREPARING") {
    // PREPARING 단계 — 부분발송 가능, 전량 발송됐으면 PREPARING_PACKED 로 자동 전이됐을 것 — 안전망
    if (shippedQty >= quantity - 0.0001 && shippedQty > 0) return "FULLY_SHIPPED";
    if (shippedQty > 0) return "PARTIAL_SHIP";
    return "WAITING_SHIP";
  }

  if (status === "PREPARING_PACKED") {
    if (shippedQty >= quantity - 0.0001 && shippedQty > 0) return "FULLY_SHIPPED";
    if (shippedQty > 0) return "PARTIAL_SHIP";
    return "PACKED_LINE";
  }

  if (status === "SHIPPED") {
    if (shippedQty >= quantity - 0.0001 && shippedQty > 0) return "FULLY_SHIPPED";
    if (shippedQty > 0) return "PARTIAL_SHIP";
    return "PACKED_LINE";
  }

  if (status === "COMPLETED") {
    if (returnedQty <= 0) return "DELIVERED";
    if (returnedQty < quantity - 0.0001) return "PARTIAL_RETURN";
    return "RETURNED_LINE";
  }

  // 반품/교환 단계 — claimType 으로 라벨 분기는 ItemPhaseBadge 에서 처리
  if (status === "RETURN_REQUESTED") return "RETURN_REQUESTED_LINE";
  if (status === "RETURN_ACCEPTED") return "RETURN_ACCEPTED_LINE";
  if (status === "RETURN_PICKING") return "RETURN_PICKING_LINE";
  if (status === "RETURN_COLLECTED") return "RETURN_COLLECTED_LINE";
  if (status === "RETURN_INSPECTED") return "RETURN_INSPECTED_LINE";

  if (status === "RETURNED") {
    if (returnedQty <= 0) return "DELIVERED"; // 다른 라인만 반품된 경우
    if (returnedQty < quantity - 0.0001) return "PARTIAL_RETURN";
    return "RETURNED_LINE";
  }

  if (status === "EXCHANGED") {
    if (returnedQty <= 0) return "DELIVERED";
    return "EXCHANGED_LINE";
  }

  return "WAITING_SHIP";
}

/** 기본 라벨 — 반품 흐름 기준. claimType=EXCHANGE_* 면 ItemPhaseBadge 가 교환 라벨로 swap */
export const ITEM_PHASE_LABELS: Record<ItemPhase, string> = {
  PENDING_LINE: "접수",
  WAITING_SHIP: "출고대기",
  PACKED_LINE: "출고확정",
  PARTIAL_SHIP: "부분발송",
  FULLY_SHIPPED: "배송중",
  DELIVERED: "배송완료",
  RETURN_REQUESTED_LINE: "반품요청",
  RETURN_ACCEPTED_LINE: "반품 회수대기",
  RETURN_PICKING_LINE: "반품 회수중",
  RETURN_COLLECTED_LINE: "회수완료",
  RETURN_INSPECTED_LINE: "검수완료",
  RETURNED_LINE: "반품완료",
  PARTIAL_RETURN: "부분반품",
  EXCHANGED_LINE: "교환완료",
  CANCELLED_LINE: "취소",
};

/**
 * 교환 흐름 (claimType=EXCHANGE_*) 의 라벨 — 같은 phase 위에서 라벨만 다름.
 * ItemPhaseBadge 가 claimType 보고 이쪽 매핑 사용.
 */
export const ITEM_PHASE_LABELS_EXCHANGE: Partial<Record<ItemPhase, string>> = {
  RETURN_REQUESTED_LINE: "교환요청",
  RETURN_ACCEPTED_LINE: "교환 회수대기",
  RETURN_PICKING_LINE: "교환 회수중",
  RETURN_COLLECTED_LINE: "교환 회수완료",
  RETURN_INSPECTED_LINE: "교환 검수완료",
  PARTIAL_RETURN: "부분교환",
};

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
/** 채널 필터 — 오프라인(channelId=null) / 외부 채널 전체(channelId!=null) / 특정 channelId / 전체 */
export type ChannelFilter = "all" | "offline" | "external" | string;

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
  RETURN_PICKING: "반품 회수중",
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
 *  - COMPLETED + fulfillmentType=IN_STORE: "매장판매" (즉시 인도 종결)
 *  - COMPLETED + fulfillmentType=PICKUP: "픽업완료" (대기 후 손님 방문 수령 종결)
 *  - PREPARING + fulfillmentType=PICKUP: "픽업대기" (재고 차감 후 손님 방문 대기)
 *  - RETURN_REQUESTED + EXCHANGE_*: "교환요청"
 *  - RETURN_ACCEPTED + EXCHANGE_*: "교환 회수대기"
 *  - 그 외 RETURN_*: 기본 라벨 ("반품...")
 */
export function statusLabel(
  status: OrderStatus,
  ctx: {
    channelId?: string | null;
    claimType?: OrderClaimType | null;
    fulfillmentType?: FulfillmentType | null;
  } = {},
): string {
  if (status === "PENDING") {
    return ctx.channelId ? "주문" : "접수";
  }
  if (status === "COMPLETED") {
    if (ctx.fulfillmentType === "IN_STORE") return "매장판매";
    if (ctx.fulfillmentType === "PICKUP") return "픽업완료";
  }
  if (status === "PREPARING" && ctx.fulfillmentType === "PICKUP") {
    return "픽업대기";
  }
  const isExchangeClaim =
    ctx.claimType === "EXCHANGE_SAME" || ctx.claimType === "EXCHANGE_DIFFERENT";
  if (isExchangeClaim) {
    if (status === "RETURN_REQUESTED") return "교환요청";
    if (status === "RETURN_ACCEPTED") return "교환 회수대기";
    if (status === "RETURN_PICKING") return "교환 회수중";
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
  IN_STORE: "매장판매",
  PICKUP: "픽업",
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
  closed: "종결",
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
  fulfillmentType?: FulfillmentType | null,
): { action: WorkboardAction; label: string } | null {
  const isPickup = fulfillmentType === "PICKUP";
  switch (status) {
    case "PENDING":
      return { action: "prepare", label: isPickup ? "픽업준비" : "출고대기" };
    case "PREPARING":
      // 픽업 대기는 포장·발송 단계를 건너뛰고 [픽업완료] 로 직행
      if (isPickup) return { action: "complete", label: "픽업완료" };
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
    nextHint: "택배 회수 라벨 발급(회수 시작) 또는 매장 직접 회수 → 회수완료",
  },
  RETURN_PICKING: {
    meaning: "회수중 — 택배 회수 라벨 발급됨, 손님→매장 운송 중",
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
