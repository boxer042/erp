/**
 * 외부 채널(쿠팡·네이버 등) ↔ ERP Order 변환 layer.
 *
 * Phase 1 — 어댑터 인터페이스만 정의. 실제 채널 구현은 Phase 2 (가입·API 키 후).
 * 가입 전에도 Mock 어댑터로 import 흐름을 dev 환경에서 검증 가능.
 */

/** 채널이 보내주는 raw 주문 — 모든 채널 공통 normalized 형태 */
export interface RawChannelOrder {
  /** 채널의 주문번호 (channelOrderNo). 동일 채널 내 unique */
  channelOrderNo: string;
  /** 채널 주문 시각 (ISO) */
  orderedAt: string;
  /** 손님 정보 — 채널이 제공하는 만큼만 */
  buyer: {
    name?: string;
    phone?: string;
  };
  /** 받는 사람 — buyer 와 다를 수 있음 (선물 등) */
  recipient: {
    name?: string;
    phone?: string;
    address?: string;
  };
  /** 항목 — channelSku 로 ERP Product 와 매칭. 매칭 실패 시 보류 큐로 격리 */
  items: Array<{
    channelSku: string;
    channelProductName?: string;
    quantity: number;
    /** 채널 단가 (세전 권장. 채널마다 다름 — 어댑터에서 normalize) */
    unitPrice: number;
  }>;
  /** 출고 방식 — 채널이 명시 안 하면 SHIPPING 기본 */
  fulfillmentType?: "DELIVERY" | "SHIPPING";
  /** 출고 예정일 — 채널 정책에 따라 (쿠팡 D+1, 네이버 정책 등) */
  expectedShipDate?: string;
  /** 채널 측 결제 완료 여부 — 보통 채널이 결제 받고 정산하므로 PAID 가 일반적 */
  prepaid?: boolean;
  /** 메모 — 손님 요청사항 등 */
  memo?: string;
  /** 원본 raw — 디버깅·재변환용. 보류 큐의 rawPayload 에 저장 */
  raw?: unknown;
}

/**
 * 채널 어댑터 — 모든 채널이 따라야 할 contract.
 * 가입 전에도 Mock 으로 구현해 검증 가능.
 */
export interface ChannelAdapter {
  /** 채널 식별 코드 — SalesChannel.code 와 매칭 */
  readonly code: string;
  /** UI 표시명 */
  readonly displayName: string;

  /**
   * since 이후 신규 주문 fetch.
   * Phase 2 에서 폴링 또는 webhook 으로 트리거.
   */
  fetchNewOrders(since: Date): Promise<RawChannelOrder[]>;

  /**
   * 송장 번호를 채널에 push (출고 처리 시).
   * Phase 2 에서 ERP `[발송]` 액션 후 자동 호출.
   */
  pushTrackingNumber?(
    channelOrderNo: string,
    carrier: string,
    trackingNumber: string,
  ): Promise<void>;

  /**
   * 반품 요청 수락 알림 (외부 채널에 ack).
   * Phase 2 에서 ERP `[수락]` 후 자동 호출.
   */
  acceptReturn?(channelOrderNo: string): Promise<void>;

  /**
   * 반품 반려 알림.
   */
  rejectReturn?(channelOrderNo: string, reason: string): Promise<void>;
}

/** Import 결과 요약 */
export interface ImportResult {
  /** 정식 Order 로 변환된 개수 */
  ordersCreated: number;
  /** 보류 큐로 격리된 개수 (매핑 누락 등) */
  pendingCreated: number;
  /** 이미 import 된 채널주문번호 (중복) */
  duplicates: number;
  /** 변환 실패 (validation) */
  failed: number;
  /** 사람이 읽을 요약 메시지 */
  message: string;
}
