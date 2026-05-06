import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

/**
 * 거래처가 발주 수락 — 인증 우회.
 *
 * 보안:
 * - same-origin POST 요구 (CSRF 약식 방어)
 * - 토큰이 ACTIVE/VIEWED 일 때만 허용
 * - 발주 status 가 SENT 또는 PARTIAL_RESENT 일 때만 자동 전환
 * - 한 번 ACCEPTED 되면 재시도 거부
 *
 * 자동 status 전환:
 *   SENT          → CONFIRMED
 *   PARTIAL_RESENT → PARTIAL_REACCEPTED
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // CSRF 약식 방어 — Origin 이 자기 자신과 같은지 확인
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: "잘못된 요청 출처입니다" }, { status: 403 });
  }

  const { token } = await params;
  const accessToken = await prisma.purchaseOrderAccessToken.findUnique({
    where: { token },
    include: { purchaseOrder: { select: { id: true, poNo: true, status: true } } },
  });

  if (!accessToken) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다" }, { status: 404 });
  }

  // 만료 체크
  if (accessToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "만료된 링크입니다" }, { status: 410 });
  }

  // 사용 가능 상태 검증
  if (!["ACTIVE", "VIEWED"].includes(accessToken.status)) {
    return NextResponse.json(
      { error: "이미 처리되었거나 사용할 수 없는 링크입니다", status: accessToken.status },
      { status: 409 }
    );
  }

  const po = accessToken.purchaseOrder;
  if (!["SENT", "PARTIAL_RESENT"].includes(po.status)) {
    return NextResponse.json(
      { error: "현재 발주 상태에서는 수락할 수 없습니다", poStatus: po.status },
      { status: 409 }
    );
  }

  const nextPoStatus = po.status === "SENT" ? "CONFIRMED" : "PARTIAL_REACCEPTED";

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderAccessToken.update({
      where: { id: accessToken.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: nextPoStatus },
    });
    await recordAudit(tx, {
      userId: null, // 외부 거래처가 행한 액션 — 시스템 사용자
      entity: "PurchaseOrder",
      entityId: po.id,
      action: "STATUS_CHANGE",
      meta: {
        from: po.status,
        to: nextPoStatus,
        via: "external_token",
        tokenId: accessToken.id,
        poNo: po.poNo,
      },
    });
  });

  return NextResponse.json({ ok: true, poStatus: nextPoStatus });
}
