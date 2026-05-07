/**
 * POST /api/channels/[id]/import
 *
 * 어댑터의 fetchNewOrders 호출 후 ERP 로 import.
 * Phase 1 — registry 에 어댑터 등록된 채널만 가능 (Mock 포함).
 * Phase 2 — 실제 polling 또는 webhook 으로 자동 호출.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getChannelAdapter } from "@/lib/channels/registry";
import { importChannelOrders } from "@/lib/channels/import";
import { recordAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id: channelId } = await params;

  const channel = await prisma.salesChannel.findUnique({
    where: { id: channelId },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!channel) {
    return NextResponse.json(
      { error: "채널을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  if (!channel.isActive) {
    return NextResponse.json(
      { error: "비활성 채널은 import 할 수 없습니다" },
      { status: 400 },
    );
  }

  const adapter = getChannelAdapter(channel.code);
  if (!adapter) {
    return NextResponse.json(
      {
        error: `이 채널(${channel.code})의 어댑터가 등록되지 않았습니다 — Phase 2 에서 구현 예정`,
      },
      { status: 400 },
    );
  }

  // body.since 가 있으면 그 이후, 없으면 마지막 import 후. Phase 1 단순화: 24시간 전 default.
  const body = (await request.json().catch(() => ({}))) as {
    since?: string;
  };
  const since = body.since
    ? new Date(body.since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  let rawOrders;
  try {
    rawOrders = await adapter.fetchNewOrders(since);
  } catch (e) {
    return NextResponse.json(
      {
        error: `어댑터 fetchNewOrders 실패: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 502 },
    );
  }

  const result = await importChannelOrders(prisma, channelId, rawOrders, {
    importedById: user.id,
  });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "SalesChannel",
    entityId: channelId,
    action: "IMPORT",
    meta: {
      channelCode: channel.code,
      channelName: channel.name,
      since: since.toISOString(),
      ...result,
    },
  });

  return NextResponse.json(result);
}
