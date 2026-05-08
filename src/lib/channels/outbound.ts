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
 * 송장 정보를 채널에 push. 채널 없는 주문(오프라인)·어댑터 미등록·config.autoTrackingPush=false 면 no-op.
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
  // config.autoTrackingPush 가 명시적 false 면 skip (default: true)
  if (ctx.channelId) {
    const channel = await prisma.salesChannel.findUnique({
      where: { id: ctx.channelId },
      select: { config: true },
    });
    const cfg = (channel?.config as Record<string, unknown> | null) ?? {};
    if (cfg.autoTrackingPush === false) return;
  }
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

/**
 * 재고 sync — productId 들의 가용 재고를 매핑된 모든 채널에 push.
 *
 * 호출 위치: Inventory 변동이 있는 모든 곳.
 *  - 주문 prepare/cancel/return/exchange (Order)
 *  - 입고 확정 (Incoming)
 *  - 실사보정 (Stocktake)
 *  - 조립/분해 (Assembly)
 *
 * 정책:
 *  - 비동기·best-effort. 실패해도 ERP 트랜잭션 영향 X
 *  - 매핑된 (channelId, channelSku) 만 push. 비매핑 SKU 는 채널이 모르니 무시
 *  - 채널 어댑터가 pushStock 미구현이면 skip
 *
 * Phase 1: Mock 어댑터는 no-op. Phase 2 후 실 채널에서 작동.
 */
export async function dispatchPushStock(
  prisma: PrismaClient,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  try {
    const mappings = await prisma.channelProductMapping.findMany({
      where: { productId: { in: productIds } },
      select: {
        channelSku: true,
        productId: true,
        channel: { select: { id: true, code: true, isActive: true, config: true } },
        product: {
          select: {
            inventory: { select: { quantity: true } },
          },
        },
      },
    });
    // 채널별로 그룹핑
    const byChannel = new Map<
      string,
      { code: string; items: Array<{ channelSku: string; availableQty: number }> }
    >();
    for (const m of mappings) {
      if (!m.channel.isActive) continue;
      const adapter = getChannelAdapter(m.channel.code);
      if (!adapter || !adapter.pushStock) continue;
      // config.autoStockSync 가 명시적 true 가 아니면 skip (default: false)
      const cfg = (m.channel.config as Record<string, unknown> | null) ?? {};
      if (cfg.autoStockSync !== true) continue;
      // 다중 매핑 (m.product=null) 은 가용 재고 계산이 복잡하니 단일 매핑만 push.
      // 다중 매핑 sync 는 후속 (component 별 inventory min 비례 계산 필요).
      if (!m.product) continue;
      const qty = m.product.inventory
        ? Number(m.product.inventory.quantity)
        : 0;
      const entry = byChannel.get(m.channel.code) ?? {
        code: m.channel.code,
        items: [],
      };
      entry.items.push({ channelSku: m.channelSku, availableQty: qty });
      byChannel.set(m.channel.code, entry);
    }
    // 채널별 push (병렬)
    await Promise.all(
      Array.from(byChannel.values()).map(async ({ code, items }) => {
        const adapter = getChannelAdapter(code);
        if (!adapter?.pushStock) return;
        try {
          await adapter.pushStock(items);
        } catch (e) {
          console.error(
            `[outbound/push-stock] ${code} push 실패`,
            e instanceof Error ? e.message : e,
          );
        }
      }),
    );
  } catch (e) {
    // 메인 흐름 영향 X — 로그만
    console.error(
      "[outbound/push-stock] 전체 실패",
      e instanceof Error ? e.message : e,
    );
  }
}
