import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { purchaseOrderAcceptSchema } from "@/lib/validators/purchase-order";

/**
 * 거래처가 발주 수락 — 인증 우회.
 *
 * 보안:
 * - same-origin POST 요구 (CSRF 약식 방어)
 * - 토큰이 ACTIVE/VIEWED 일 때만 허용
 * - 발주 status 가 SENT 또는 PARTIAL_RESENT 일 때만 자동 전환
 * - 가격 미정 라인이 하나라도 있으면 [수락] 차단 (단가 변경 요청만 가능)
 * - 한 번 ACCEPTED 되면 재시도 거부
 *
 * Payload (2026-05-23 도입):
 *   { shippingMethod, promisedDate, shippingMemo? }
 * - PICKUP: 우리가 PO 발송 시 사전 선택 — 거래처는 promisedDate 만 입력하면 됨
 * - 그 외: 거래처가 출고 방법 + 납기일 + 메모 입력
 *
 * 자동 status 전환:
 *   SENT          → CONFIRMED
 *   PARTIAL_RESENT → PARTIAL_REACCEPTED
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

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = purchaseOrderAcceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const payload = parsed.data;

  const accessToken = await prisma.purchaseOrderAccessToken.findUnique({
    where: { token },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          poNo: true,
          status: true,
          shippingMethod: true,
          items: { select: { id: true, priceUndetermined: true } },
        },
      },
    },
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

  const po = accessToken.purchaseOrder;
  if (!["SENT", "PARTIAL_RESENT"].includes(po.status)) {
    return NextResponse.json(
      { error: "현재 발주 상태에서는 수락할 수 없습니다", poStatus: po.status },
      { status: 409 }
    );
  }

  // 가격 미정 가드 — 라인이 하나라도 priceUndetermined 면 거래처가 단가 협상을 거쳐야 함
  const hasUndetermined = po.items.some((it) => it.priceUndetermined);
  if (hasUndetermined) {
    return NextResponse.json(
      {
        error:
          "가격 미정 라인이 있어 직접 수락할 수 없습니다. [단가 변경 요청] 으로 가격을 제안해주세요.",
      },
      { status: 409 }
    );
  }

  // PICKUP 일 땐 우리가 사전 선택한 값 유지, 그 외엔 거래처가 보낸 값 저장.
  const finalShippingMethod = po.shippingMethod === "PICKUP" ? "PICKUP" : payload.shippingMethod!;
  const nextPoStatus = po.status === "SENT" ? "CONFIRMED" : "PARTIAL_REACCEPTED";

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderAccessToken.update({
      where: { id: accessToken.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: nextPoStatus,
        shippingMethod: finalShippingMethod,
        promisedDate: new Date(payload.promisedDate),
        shippingMemo: payload.shippingMemo?.trim() || null,
      },
    });
    await recordAudit(tx, {
      userId: null,
      entity: "PurchaseOrder",
      entityId: po.id,
      action: "STATUS_CHANGE",
      meta: {
        from: po.status,
        to: nextPoStatus,
        via: "external_token",
        tokenId: accessToken.id,
        poNo: po.poNo,
        shippingMethod: finalShippingMethod,
        promisedDate: payload.promisedDate,
        shippingMemo: payload.shippingMemo ?? null,
      },
    });
  });

  return NextResponse.json({ ok: true, poStatus: nextPoStatus });
}
