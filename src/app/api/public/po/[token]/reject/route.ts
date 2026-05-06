import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

/**
 * 거래처가 발주 거절 — 인증 우회.
 *
 * 토큰만 REJECTED 처리. 발주 status 는 자동 변경하지 않음 (ERP 사용자가 직접 처리).
 * 거절 사유는 옵션 (rejectionNote).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: "잘못된 요청 출처입니다" }, { status: 403 });
  }

  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const note: string | null = typeof body?.note === "string" ? body.note.slice(0, 500) : null;

  const accessToken = await prisma.purchaseOrderAccessToken.findUnique({
    where: { token },
    include: { purchaseOrder: { select: { id: true, poNo: true, status: true } } },
  });

  if (!accessToken) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다" }, { status: 404 });
  }
  if (accessToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "만료된 링크입니다" }, { status: 410 });
  }
  if (!["ACTIVE", "VIEWED"].includes(accessToken.status)) {
    return NextResponse.json(
      { error: "이미 처리되었거나 사용할 수 없는 링크입니다", status: accessToken.status },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderAccessToken.update({
      where: { id: accessToken.id },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectionNote: note },
    });
    await recordAudit(tx, {
      userId: null,
      entity: "PurchaseOrder",
      entityId: accessToken.purchaseOrder.id,
      action: "STATUS_CHANGE",
      meta: {
        action: "EXTERNAL_REJECT",
        tokenId: accessToken.id,
        note,
        poNo: accessToken.purchaseOrder.poNo,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
