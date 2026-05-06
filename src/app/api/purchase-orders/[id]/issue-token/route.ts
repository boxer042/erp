import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { generateAccessToken, defaultTokenExpiresAt } from "@/lib/purchase-order-token";

/**
 * 거래처용 발주 수락 토큰 발급.
 *
 * - 발주 상태가 DRAFT 또는 PARTIAL 일 때만 발급 가능
 *   - DRAFT 에서 발급 → 발주 status = SENT 로 자동 전환
 *   - PARTIAL 에서 발급 → status = PARTIAL_RESENT 로 자동 전환 (잔량 재요청)
 *   - 이미 SENT 또는 PARTIAL_RESENT 인 경우는 그대로, 토큰만 새로 발급 (재발송)
 * - 같은 발주의 기존 ACTIVE/VIEWED 토큰은 모두 REVOKED
 * - 응답: { token, url } — 사용자가 카톡으로 보낼 수 있는 URL
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, poNo: true, status: true },
  });
  if (!po) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }

  const allowedStatuses = ["DRAFT", "SENT", "PARTIAL", "PARTIAL_RESENT"];
  if (!allowedStatuses.includes(po.status)) {
    return NextResponse.json(
      { error: "현재 상태에서는 거래처 발송이 불가능합니다" },
      { status: 409 }
    );
  }

  const token = generateAccessToken();
  const expiresAt = defaultTokenExpiresAt();

  // status 자동 전환 결정
  let nextStatus: typeof po.status = po.status;
  if (po.status === "DRAFT") nextStatus = "SENT";
  if (po.status === "PARTIAL") nextStatus = "PARTIAL_RESENT";

  await prisma.$transaction(async (tx) => {
    // 1. 기존 ACTIVE/VIEWED 토큰 모두 REVOKED
    await tx.purchaseOrderAccessToken.updateMany({
      where: { purchaseOrderId: id, status: { in: ["ACTIVE", "VIEWED"] } },
      data: { status: "REVOKED" },
    });

    // 2. 새 토큰 발급
    await tx.purchaseOrderAccessToken.create({
      data: { purchaseOrderId: id, token, expiresAt },
    });

    // 3. 발주 status 업데이트
    if (nextStatus !== po.status) {
      await tx.purchaseOrder.update({ where: { id }, data: { status: nextStatus } });
    }

    // 4. Audit
    await recordAudit(tx, {
      userId: user.id,
      entity: "PurchaseOrder",
      entityId: id,
      action: "STATUS_CHANGE",
      meta: { from: po.status, to: nextStatus, action: "ISSUE_TOKEN", poNo: po.poNo },
    });
  });

  // base URL 결정 — 환경변수 우선, 없으면 request origin
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (() => {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");
      if (origin) return origin;
      if (host) {
        const proto = request.headers.get("x-forwarded-proto") || "http";
        return `${proto}://${host}`;
      }
      return "";
    })();

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    url: baseUrl ? `${baseUrl}/external/po/${token}` : `/external/po/${token}`,
    nextStatus,
  });
}
