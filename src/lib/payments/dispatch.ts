/**
 * PG 환불 발송 진입점 — best-effort hook.
 *
 * 정책:
 *  - 단일 글로벌 어댑터 (Phase 1: Mock, Phase 2 후 Toss/PortOne 등)
 *  - 실패해도 ERP 흐름 영향 X — audit log 만 기록
 *  - 부분/전체 환불 모두 동일 인터페이스 (partial 플래그로 구분)
 *
 * 호출 위치 (api/orders/[id]/route.ts):
 *  - cancel: PREPARING 이상 + PAID 였던 주문 → dispatchPaymentCancel
 *  - refund/return: 전체 환불 → dispatchRefund (partial=false)
 *  - 부분 refund: → dispatchRefund (partial=true)
 *  - exchange: 환불 X (차액은 새 주문에서 정산) → 호출 안 함
 *
 * Phase 1: Mock 어댑터로 콘솔 로그만. Phase 2 후 실 PG 어댑터로 교체하면 자동 활성화.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { mockPaymentAdapter } from "./mock";
import type { RefundRequest } from "./types";
import { recordAudit } from "@/lib/audit";

type Tx = Prisma.TransactionClient | PrismaClient;

const adapter = mockPaymentAdapter;

interface DispatchContext {
  orderId: string;
  orderNo: string;
  amount: number;
  reason?: string;
  /** 환불 트리거한 ERP user id — audit log 용 */
  userId: string | null;
}

/**
 * 환불 처리. 부분/전체 모두 이 entry point.
 * partial=true 면 부분 환불 (PG 에 따라 별도 API 일 수 있음 — 어댑터가 처리).
 */
export async function dispatchRefund(
  prisma: Tx,
  ctx: DispatchContext,
  partial: boolean,
): Promise<void> {
  const req: RefundRequest = {
    orderId: ctx.orderId,
    orderNo: ctx.orderNo,
    amount: ctx.amount,
    reason: ctx.reason,
    partial,
  };
  try {
    const result = await adapter.refund(req);
    await recordAudit(prisma, {
      userId: ctx.userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        pgRefund: partial ? "PARTIAL" : "FULL",
        result: result.ok ? "OK" : "FAILED",
        amount: ctx.amount,
        refundTxId: result.refundTxId,
        adapter: adapter.code,
        ...(result.error ? { error: result.error } : {}),
      },
    });
  } catch (e) {
    console.error("[payments/refund] dispatch 실패", e);
    await recordAudit(prisma, {
      userId: ctx.userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        pgRefund: partial ? "PARTIAL" : "FULL",
        result: "FAILED",
        amount: ctx.amount,
        adapter: adapter.code,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

/** 결제 취소 — PREPARING 이상 cancel 시. PG 에 따라 refund 와 다른 API 일 수 있음. */
export async function dispatchPaymentCancel(
  prisma: Tx,
  ctx: DispatchContext,
): Promise<void> {
  const req: RefundRequest = {
    orderId: ctx.orderId,
    orderNo: ctx.orderNo,
    amount: ctx.amount,
    reason: ctx.reason,
    partial: false,
  };
  try {
    const fn = adapter.cancelPayment ?? adapter.refund;
    const result = await fn.call(adapter, req);
    await recordAudit(prisma, {
      userId: ctx.userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "CANCEL",
      meta: {
        pgCancel: "OK",
        result: result.ok ? "OK" : "FAILED",
        amount: ctx.amount,
        refundTxId: result.refundTxId,
        adapter: adapter.code,
      },
    });
  } catch (e) {
    console.error("[payments/cancel] dispatch 실패", e);
  }
}
