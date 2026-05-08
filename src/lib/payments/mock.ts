/**
 * Mock PG 어댑터 — Phase 1 검증용.
 *
 * 실제 PG (Toss/PortOne 등) 가입 전 dev 환경에서 환불 흐름 검증.
 * 콘솔 로그 + 메모리 누적. 실제 외부 호출 X.
 */
import type { PaymentAdapter, RefundRequest, RefundResult } from "./types";

interface RefundRecord {
  at: Date;
  req: RefundRequest;
  result: RefundResult;
}

class MockPaymentAdapter implements PaymentAdapter {
  readonly code = "MOCK";
  readonly displayName = "Mock PG (dev 검증용)";
  private records: RefundRecord[] = [];

  async refund(req: RefundRequest): Promise<RefundResult> {
    const refundTxId = `MOCK-RF-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const result: RefundResult = { ok: true, refundTxId };
    this.records.push({ at: new Date(), req, result });
    if (this.records.length > 200) this.records.shift();
    console.info(
      `[payment/mock] ${req.partial ? "부분 환불" : "환불"} ${req.orderNo} | ₩${req.amount.toLocaleString("ko-KR")} | tx=${refundTxId}${req.reason ? ` | ${req.reason}` : ""}`,
    );
    return result;
  }

  async cancelPayment(req: RefundRequest): Promise<RefundResult> {
    // Mock — refund 와 동일 처리
    return this.refund(req);
  }

  recent(limit = 50): RefundRecord[] {
    return this.records.slice(-limit).reverse();
  }
}

export const mockPaymentAdapter = new MockPaymentAdapter();
