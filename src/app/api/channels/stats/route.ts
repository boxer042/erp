/**
 * GET /api/channels/stats — 외부 채널 import 운영 통계.
 *
 * 응답:
 *  - pendingByStatus: 보류 큐 상태별 카운트
 *  - last7Days: 최근 7일 import 통계 (정상 / 보류 / 중복 / 실패)
 *  - missingSkuTop: 매핑 누락 SKU top 10 (자주 들어오는 미매핑 SKU 우선 매핑 안내)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. 보류 큐 상태별 카운트
  const pendingGroups = await prisma.pendingChannelOrder.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const pendingByStatus: Record<string, number> = {
    UNMAPPED_SKU: 0,
    VALIDATION_FAILED: 0,
    DUPLICATE: 0,
    RESOLVED: 0,
    DISCARDED: 0,
  };
  for (const g of pendingGroups) {
    pendingByStatus[g.status] = g._count._all;
  }

  // 2. 최근 7일 import 결과 — 동일 모델에 시간 필터로 카운트
  const last7Pending = await prisma.pendingChannelOrder.count({
    where: { createdAt: { gte: since }, status: "UNMAPPED_SKU" },
  });
  const last7Resolved = await prisma.pendingChannelOrder.count({
    where: { resolvedAt: { gte: since }, status: "RESOLVED" },
  });
  // Order 의 채널 import (channelId 있고 createdAt 7일내)
  const last7Imported = await prisma.order.count({
    where: { channelId: { not: null }, createdAt: { gte: since } },
  });

  // 3. 매핑 누락 SKU top — UNMAPPED_SKU 보류에서 raw payload 의 channelSku 빈도
  const recentPending = await prisma.pendingChannelOrder.findMany({
    where: { status: "UNMAPPED_SKU" },
    select: { channelId: true, rawPayload: true, channel: { select: { name: true } } },
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  const skuCount = new Map<
    string,
    { channelSku: string; channelId: string; channelName: string; count: number }
  >();
  for (const p of recentPending) {
    const items = (p.rawPayload as { items?: Array<{ channelSku?: string }> })
      .items;
    if (!items) continue;
    for (const it of items) {
      const sku = it.channelSku;
      if (!sku) continue;
      const key = `${p.channelId}::${sku}`;
      const existing = skuCount.get(key);
      if (existing) {
        existing.count++;
      } else {
        skuCount.set(key, {
          channelSku: sku,
          channelId: p.channelId,
          channelName: p.channel.name,
          count: 1,
        });
      }
    }
  }
  const missingSkuTop = Array.from(skuCount.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    pendingByStatus,
    last7Days: {
      imported: last7Imported,
      pending: last7Pending,
      resolved: last7Resolved,
    },
    missingSkuTop,
  });
}
