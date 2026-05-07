/**
 * 알림 시스템 — Phase 1 (Mock).
 *
 * 매장·고객에게 SMS/이메일/카카오 알림톡 등을 보내는 layer.
 * 외부 SaaS (Solapi/Twilio/카카오비즈) 가입 후 실 어댑터 추가하면 활성화.
 *
 * 트리거 위치:
 *  - 출고 알림 (배송완료) — 고객
 *  - 반품 수락/반려 — 고객
 *  - 차액 결제 안내 (EXCHANGE_DIFFERENT) — 고객
 *  - 보류 큐 임계값 초과 — 매장 운영자
 *  - 매핑 누락 SKU 누적 — 매장 운영자
 *
 * 채널 자동화 layer 와 동일 패턴: Adapter 인터페이스 + Mock + Registry.
 */

export type NotificationChannel = "sms" | "email" | "kakao";

/** 알림 수신 대상 */
export interface NotificationRecipient {
  /** 식별자 — 운영자면 user.id, 고객이면 customer.id 또는 phone 직접 */
  id?: string;
  phone?: string;
  email?: string;
  name?: string;
}

/** 알림 내용 — 채널별 적합한 형식으로 변환은 어댑터 책임 */
export interface NotificationPayload {
  /** 알림 종류 — 운영 통계·필터에 사용 */
  kind:
    | "ORDER_DELIVERED"
    | "RETURN_ACCEPTED"
    | "RETURN_REJECTED"
    | "EXCHANGE_DIFFERENT_PAYMENT"
    | "PENDING_QUEUE_THRESHOLD"
    | "MAPPING_MISSING_TOP"
    | "OTHER";
  /** 제목 (이메일·푸시) */
  subject?: string;
  /** 본문 — 단순 텍스트. 채널별 마크업 필요하면 어댑터에서 가공 */
  body: string;
  /** 추가 메타 — 클릭 link 등 */
  meta?: Record<string, unknown>;
}

export interface NotificationAdapter {
  readonly code: string;
  readonly displayName: string;
  /** 지원 채널 — 호출자가 어댑터 선택에 활용 */
  readonly supportedChannels: NotificationChannel[];

  send(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload,
  ): Promise<{ ok: boolean; error?: string }>;
}
