import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { purchaseOrderStatusUpdateSchema } from "@/lib/validators/purchase-order";
import { recordAudit } from "@/lib/audit";

// 발주 상태 전환 — 사용자가 명시적으로 누르는 버튼:
// - SENT: 거래처 발송
// - CONFIRMED: 거래처 수락
// - PARTIAL_RESENT: 부분입고 후 잔량 재요청 발송
// - PARTIAL_REACCEPTED: 거래처가 재요청 수락
// - CLOSED: 부분만 받고 조기 종료 (잔량 포기)
// - CANCELLED: 발주 자체 취소 (입고 없을 때만)
// PARTIAL/PARTIAL_COMPLETED/RECEIVED 는 입고 등록/확정 시 자동 전환되므로 직접 호출 불가.
const MANUAL_TARGETS = new Set([
  "DRAFT", "SENT", "CONFIRMED", "PARTIAL_RESENT", "PARTIAL_REACCEPTED", "CLOSED", "CANCELLED",
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = purchaseOrderStatusUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const target = parsed.data.status;

  if (!MANUAL_TARGETS.has(target)) {
    return NextResponse.json(
      { error: "이 상태는 수동으로 전환할 수 없습니다 (입고 흐름에서 자동 처리)" },
      { status: 400 }
    );
  }

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { incomings: { select: { id: true, status: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }

  // 가드:
  if (target === "CANCELLED") {
    const hasNonCancelledIncoming = existing.incomings.some((i) => i.status !== "CANCELLED");
    if (hasNonCancelledIncoming) {
      return NextResponse.json(
        { error: "입고가 진행된 발주는 취소할 수 없습니다 (부분입고 종결을 사용하세요)" },
        { status: 409 }
      );
    }
  }
  const terminal = new Set(["RECEIVED", "PARTIAL_COMPLETED", "CLOSED", "CANCELLED"]);
  if (terminal.has(existing.status) && existing.status !== target) {
    return NextResponse.json(
      { error: "종료된 발주의 상태는 변경할 수 없습니다" },
      { status: 409 }
    );
  }
  // CLOSED 는 입고 1건 이상 있어야 의미가 있음 (없으면 CANCELLED 가 맞음)
  if (target === "CLOSED") {
    const hasIncoming = existing.incomings.some((i) => i.status !== "CANCELLED");
    if (!hasIncoming) {
      return NextResponse.json(
        { error: "입고 기록이 없는 발주는 부분입고 종결 대신 취소를 사용하세요" },
        { status: 409 }
      );
    }
    if (!["PARTIAL", "PARTIAL_RESENT", "PARTIAL_REACCEPTED"].includes(existing.status)) {
      return NextResponse.json(
        { error: "부분입고 상태에서만 종결할 수 있습니다" },
        { status: 409 }
      );
    }
  }
  // PARTIAL_RESENT 는 PARTIAL 에서만
  if (target === "PARTIAL_RESENT" && existing.status !== "PARTIAL") {
    return NextResponse.json(
      { error: "부분입고 발생 상태에서만 재발송할 수 있습니다" },
      { status: 409 }
    );
  }
  // PARTIAL_REACCEPTED 는 PARTIAL_RESENT 에서만
  if (target === "PARTIAL_REACCEPTED" && existing.status !== "PARTIAL_RESENT") {
    return NextResponse.json(
      { error: "재발송 상태에서만 수락 처리할 수 있습니다" },
      { status: 409 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.purchaseOrder.update({
      where: { id },
      data: { status: target },
    });
    await recordAudit(tx, {
      userId: user.id,
      entity: "PurchaseOrder",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: { from: existing.status, to: target, poNo: existing.poNo },
    });
    return u;
  });
  return NextResponse.json(updated);
}
