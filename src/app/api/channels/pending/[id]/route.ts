/**
 * POST /api/channels/pending/[id] — body { action: "resolve" | "discard" }
 *  - resolve: 매핑 후 정식 Order 로 승격 시도
 *  - discard: 보류 항목 버림 (스팸·테스트 주문 등)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { resolvePendingOrder } from "@/lib/channels/import";
import { recordAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "resolve") {
    const result = await resolvePendingOrder(prisma, id, {
      importedById: user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    await recordAudit(prisma, {
      userId: user.id,
      entity: "PendingChannelOrder",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: { to: "RESOLVED", orderId: result.orderId },
    });
    return NextResponse.json({ success: true, orderId: result.orderId });
  }

  if (action === "discard") {
    const pending = await prisma.pendingChannelOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!pending) {
      return NextResponse.json(
        { error: "보류 항목을 찾을 수 없습니다" },
        { status: 404 },
      );
    }
    if (pending.status === "RESOLVED") {
      return NextResponse.json(
        { error: "이미 정식 주문으로 변환된 항목입니다" },
        { status: 400 },
      );
    }
    await prisma.pendingChannelOrder.update({
      where: { id },
      data: { status: "DISCARDED" },
    });
    await recordAudit(prisma, {
      userId: user.id,
      entity: "PendingChannelOrder",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: { to: "DISCARDED" },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "유효하지 않은 액션입니다 (resolve/discard)" },
    { status: 400 },
  );
}
