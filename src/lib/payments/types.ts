/**
 * PG (결제 게이트웨이) 연동 layer — Phase 1 (Mock).
 *
 * 환불 처리·결제 취소를 PG (Toss/PortOne/이니시스 등) 에 자동 호출하는 layer.
 * 외부 SaaS 가입 후 실 어댑터 추가하면 활성화.
 *
 * 트리거 위치 (lib/payments/dispatch.ts):
 *  - api/orders/[id]/route.ts 의 cancel/refund/return/exchange 후 dispatchRefund
 *  - 부분 환불 시 dispatchPartialRefund (금액 단위)
 *
 * 채널·알림 layer 와 동일 패턴: Adapter 인터페이스 + Mock + Registry + dispatch.
 */

/** PG 환불 요청 */
export interface RefundRequest {
  /** ERP 주문 id */
  orderId: string;
  /** 주문번호 — PG 측 거래번호 매칭에 사용 */
  orderNo: string;
  /** PG 측 결제번호 — Order 에 별도 보관 필요 (paymentTxId 같은 필드, 향후 추가) */
  paymentTxId?: string;
  /** 환불 금액 (전체 또는 부분) */
  amount: number;
  /** 환불 사유 — PG 측 기록 + 손님 안내 */
  reason?: string;
  /** 부분 환불 여부 — PG 가 별도 API 일 수 있음 */
  partial: boolean;
}

export interface RefundResult {
  ok: boolean;
  /** PG 측 환불 거래 ID — 추후 조회·재처리 추적 */
  refundTxId?: string;
  error?: string;
}

export interface PaymentAdapter {
  readonly code: string;
  readonly displayName: string;

  /**
   * 결제 환불 요청. 전체 또는 부분 환불.
   * 실패 시 throw 하지 않고 RefundResult.ok=false 반환 권장.
   */
  refund(req: RefundRequest): Promise<RefundResult>;

  /**
   * 결제 취소 (PREPARING 단계 cancel — 발송 전 결제건 취소).
   * 환불보다 단순한 case. PG 에 따라 별도 API 또는 refund 와 동일.
   */
  cancelPayment?(req: RefundRequest): Promise<RefundResult>;
}
