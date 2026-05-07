/**
 * Outbound — ERP 액션 후 채널에 자동 통보 (송장 push / 반품 수락·반려).
 *
 * Phase 1 정책: best-effort.
 *  - 어댑터 호출 실패해도 ERP 액션은 그대로 진행 (예: 발송 처리는 성공, 채널 통보는 fail)
 *  - 실패는 audit log 에 기록 — 나중에 운영자가 수동 처리 또는 retry
 *  - Phase 4 본격 단계에서 ChannelOutboundJob 큐 모델 + 자동 retry 도입 예정
 *
 * 호출 위치: /api/orders/[id]/route.ts 의 ship/accept_return/reject_return 액션 직후.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { getChannelAdapter } from "./registry";
import { recordAudit } from "@/lib/audit";

type Tx = Prisma.TransactionClient | PrismaClient;

interface OutboundContext {
  orderId: string;
  channelId: string | null;
  channelOrderNo: string | null;
  channelCode?: string;
}

/**
 * 송장 정보를 채널에 push. 채널 없는 주문(오프라인)·어댑터 미등록 채널은 no-op.
 */
export async function dispatchPushTracking(
  prisma: Tx,
  ctx: OutboundContext,
  carrier: string,
  trackingNumber: string,
  userId: string | null,
): Promise<void> {
  const adapter = await resolveAdapter(prisma, ctx);
  if (!adapter) return;
  if (!adapter.pushTrackingNumber) return;
  if (!ctx.channelOrderNo) return;
  try {
    await adapter.pushTrackingNumber(ctx.channelOrderNo, carrier, trackingNumber);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "PUSH_TRACKING",
        result: "OK",
        channel: adapter.code,
        carrier,
        trackingNumber,
      },
    });
  } catch (e) {
    console.error("[outbound/push-tracking] 실패", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "PUSH_TRACKING",
        result: "FAILED",
        channel: adapter.code,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

/** 반품 수락을 채널에 통보 */
export async function dispatchAcceptReturn(
  prisma: Tx,
  ctx: OutboundContext,
  userId: string | null,
): Promise<void> {
  const adapter = await resolveAdapter(prisma, ctx);
  if (!adapter || !adapter.acceptReturn || !ctx.channelOrderNo) return;
  try {
    await adapter.acceptReturn(ctx.channelOrderNo);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: { outbound: "ACCEPT_RETURN", result: "OK", channel: adapter.code },
    });
  } catch (e) {
    console.error("[outbound/accept-return] 실패", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "ACCEPT_RETURN",
        result: "FAILED",
        channel: adapter.code,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

/** 반품 반려를 채널에 통보 */
export async function dispatchRejectReturn(
  prisma: Tx,
  ctx: OutboundContext,
  reason: string,
  userId: string | null,
): Promise<void> {
  const adapter = await resolveAdapter(prisma, ctx);
  if (!adapter || !adapter.rejectReturn || !ctx.channelOrderNo) return;
  try {
    await adapter.rejectReturn(ctx.channelOrderNo, reason);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "REJECT_RETURN",
        result: "OK",
        channel: adapter.code,
        reason,
      },
    });
  } catch (e) {
    console.error("[outbound/reject-return] 실패", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "REJECT_RETURN",
        result: "FAILED",
        channel: adapter.code,
        error: e instanceof Error ? e.message : String(e),
      },
    });
  }
}

async function resolveAdapter(prisma: Tx, ctx: OutboundContext) {
  if (!ctx.channelId) return null;
  if (ctx.channelCode) return getChannelAdapter(ctx.channelCode);
  // channelCode 미제공 시 fetch
  const channel = await prisma.salesChannel.findUnique({
    where: { id: ctx.channelId },
    select: { code: true },
  });
  if (!channel) return null;
  return getChannelAdapter(channel.code);
}
