/**
 * Outbound — ERP 액션 후 채널에 자동 통보 (송장 push / 반품 수락·반려 / 재고 sync).
 *
 * 정책:
 *  - 어댑터 호출 실패해도 ERP 액션은 그대로 진행 (예: 발송 처리는 성공, 채널 통보는 fail)
 *  - 즉시 시도 → 실패 시 ChannelOutboundJob 큐에 enqueue (cron 이 backoff 으로 자동 retry)
 *  - 모든 outbound 는 audit log 동시 기록 — 운영자가 추적 가능
 *
 * 호출 위치: /api/orders/[id]/route.ts 의 ship/accept_return/reject_return + Inventory 변동.
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
 * 실패한 outbound 를 retry 큐에 enqueue. 이미 동일 (channelId, kind, orderId) PENDING 이 있으면 skip (중복 enqueue 방지).
 */
async function enqueueRetry(
  prisma: Tx,
  params: {
    channelId: string;
    kind: "PUSH_TRACKING" | "PUSH_STOCK" | "ACCEPT_RETURN" | "REJECT_RETURN";
    payload: Prisma.InputJsonValue;
    orderId?: string | null;
    lastError: string;
  },
): Promise<void> {
  // 같은 작업 PENDING 중복 enqueue 방지 — 그냥 새로 enqueue 하면 attempts 누적이 안 됨
  const existing = await prisma.channelOutboundJob.findFirst({
    where: {
      channelId: params.channelId,
      kind: params.kind,
      status: "PENDING",
      ...(params.orderId ? { orderId: params.orderId } : { orderId: null }),
    },
    select: { id: true },
  });
  if (existing) {
    // 기존 PENDING 항목 lastError 만 갱신 (cron 이 자동 처리)
    await prisma.channelOutboundJob.update({
      where: { id: existing.id },
      data: { lastError: params.lastError, payload: params.payload },
    });
    return;
  }
  await prisma.channelOutboundJob.create({
    data: {
      channelId: params.channelId,
      kind: params.kind,
      payload: params.payload,
      orderId: params.orderId ?? null,
      lastError: params.lastError,
    },
  });
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
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[outbound/push-tracking] 실패 — retry 큐로 enqueue", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "PUSH_TRACKING",
        result: "FAILED_ENQUEUED",
        channel: adapter.code,
        error: errMsg,
      },
    });
    if (ctx.channelId) {
      await enqueueRetry(prisma, {
        channelId: ctx.channelId,
        kind: "PUSH_TRACKING",
        payload: {
          channelOrderNo: ctx.channelOrderNo,
          carrier,
          trackingNumber,
        },
        orderId: ctx.orderId,
        lastError: errMsg,
      });
    }
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
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[outbound/accept-return] 실패 — retry 큐로 enqueue", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "ACCEPT_RETURN",
        result: "FAILED_ENQUEUED",
        channel: adapter.code,
        error: errMsg,
      },
    });
    if (ctx.channelId) {
      await enqueueRetry(prisma, {
        channelId: ctx.channelId,
        kind: "ACCEPT_RETURN",
        payload: { channelOrderNo: ctx.channelOrderNo },
        orderId: ctx.orderId,
        lastError: errMsg,
      });
    }
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
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[outbound/reject-return] 실패 — retry 큐로 enqueue", e);
    await recordAudit(prisma, {
      userId,
      entity: "Order",
      entityId: ctx.orderId,
      action: "STATUS_CHANGE",
      meta: {
        outbound: "REJECT_RETURN",
        result: "FAILED_ENQUEUED",
        channel: adapter.code,
        error: errMsg,
      },
    });
    if (ctx.channelId) {
      await enqueueRetry(prisma, {
        channelId: ctx.channelId,
        kind: "REJECT_RETURN",
        payload: { channelOrderNo: ctx.channelOrderNo, reason },
        orderId: ctx.orderId,
        lastError: errMsg,
      });
    }
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
      // 단일 매핑 — productId 직접 (m.product 사용)
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

    // 다중 매핑 (component 기반) 가용 세트 수 계산 — 변경된 productId 가
    // component 로 포함된 매핑들을 찾아 모든 component 의 inventory min 으로 산출.
    //
    // 예: 채널 SKU "선물세트A" = ERP [상품X × 2 + 상품Y × 1]
    //     상품X 재고 10, 상품Y 재고 5 → min(floor(10/2), floor(5/1)) = 5 세트 가능
    const multiMappings = await prisma.channelProductMapping.findMany({
      where: {
        components: { some: { productId: { in: productIds } } },
      },
      select: {
        channelSku: true,
        channel: { select: { id: true, code: true, isActive: true, config: true } },
        components: {
          select: {
            quantity: true,
            product: {
              select: {
                inventory: { select: { quantity: true } },
              },
            },
          },
        },
      },
    });
    for (const m of multiMappings) {
      if (!m.channel.isActive) continue;
      const adapter = getChannelAdapter(m.channel.code);
      if (!adapter || !adapter.pushStock) continue;
      const cfg = (m.channel.config as Record<string, unknown> | null) ?? {};
      if (cfg.autoStockSync !== true) continue;
      if (m.components.length === 0) continue;

      // 각 component 의 inventory / quantity 의 floor 중 최소값 = 가용 세트 수
      let availableSets = Number.POSITIVE_INFINITY;
      for (const c of m.components) {
        const inv = c.product.inventory
          ? Number(c.product.inventory.quantity)
          : 0;
        const need = Number(c.quantity);
        if (need <= 0) continue;
        availableSets = Math.min(availableSets, Math.floor(inv / need));
      }
      if (!Number.isFinite(availableSets)) availableSets = 0;
      if (availableSets < 0) availableSets = 0;

      const entry = byChannel.get(m.channel.code) ?? {
        code: m.channel.code,
        items: [],
      };
      entry.items.push({
        channelSku: m.channelSku,
        availableQty: availableSets,
      });
      byChannel.set(m.channel.code, entry);
    }
    // 채널별 push (병렬). 실패하면 retry 큐로 enqueue.
    // PUSH_STOCK 은 orderId 가 없는 cross-cutting 이라 channelId 단독 dedup.
    const channelIdByCode = new Map<string, string>();
    for (const m of mappings) {
      if (m.channel.code) channelIdByCode.set(m.channel.code, m.channel.id);
    }
    for (const m of multiMappings) {
      if (m.channel.code) channelIdByCode.set(m.channel.code, m.channel.id);
    }
    await Promise.all(
      Array.from(byChannel.values()).map(async ({ code, items }) => {
        const adapter = getChannelAdapter(code);
        if (!adapter?.pushStock) return;
        try {
          await adapter.pushStock(items);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[outbound/push-stock] ${code} 실패 — retry 큐로 enqueue`, errMsg);
          const channelId = channelIdByCode.get(code);
          if (channelId) {
            await enqueueRetry(prisma, {
              channelId,
              kind: "PUSH_STOCK",
              payload: { items } as Prisma.InputJsonValue,
              orderId: null,
              lastError: errMsg,
            });
          }
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
