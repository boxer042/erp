import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { purchaseOrderAcceptSchema } from "@/lib/validators/purchase-order";

/**
 * 거래처가 발주 수락 — 인증 우회.
 *
 * 보안:
 * - same-origin POST (CSRF 약식 방어)
 * - 토큰 ACTIVE/VIEWED 일 때만 허용
 * - 발주 status SENT 또는 PARTIAL_RESENT 일 때만
 *
 * Payload:
 *   { shippingMethod, promisedDate, shippingMemo?, priceProposals?[]: { itemId, unitPrice } }
 *
 * 가격 미정 라인 처리 (2026-05-25 도입):
 * - 가격 미정 라인이 있으면 priceProposals 가 모든 라인을 커버해야 함 (각 unitPrice > 0)
 * - PO.requirePriceReview=false (기본): 입력 단가 즉시 적용 + priceUndetermined=false + 토큰 ACCEPTED + status CONFIRMED
 * - PO.requirePriceReview=true: proposedUnitPrice 에 저장 + proposalStatus=PENDING + 토큰 VIEWED 유지
 *   + status COUNTER_OFFER (우리 검토 대기). 우리가 단가 수락하면 출고 정보가 이미 있으므로
 *   재발송 없이 즉시 CONFIRMED.
 *
 * 일반 상태 전환:
 *   SENT          → CONFIRMED (또는 COUNTER_OFFER if 가격 미정 + requirePriceReview)
 *   PARTIAL_RESENT → PARTIAL_REACCEPTED (또는 COUNTER_OFFER ...)
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
          requirePriceReview: true,
          items: {
            select: {
              id: true,
              priceUndetermined: true,
              quantity: true,
              unitPrice: true,
            },
          },
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

  // 가격 미정 라인 검증 — payload.priceProposals 가 모든 미정 라인을 커버하고 단가 > 0
  const undeterminedItems = po.items.filter((it) => it.priceUndetermined);
  const proposalsMap = new Map<string, number>();
  if (payload.priceProposals) {
    for (const p of payload.priceProposals) proposalsMap.set(p.itemId, p.unitPrice);
  }
  if (undeterminedItems.length > 0) {
    for (const it of undeterminedItems) {
      const proposed = proposalsMap.get(it.id);
      if (proposed == null || !(proposed > 0)) {
        return NextResponse.json(
          { error: "가격 미정 라인의 단가를 모두 입력해주세요 (0원 초과)" },
          { status: 400 }
        );
      }
    }
  }

  // PICKUP 일 땐 우리가 사전 선택한 값 유지, 그 외엔 거래처가 보낸 값
  const finalShippingMethod = po.shippingMethod === "PICKUP" ? "PICKUP" : payload.shippingMethod!;
  const hasUndetermined = undeterminedItems.length > 0;
  const requireReview = po.requirePriceReview && hasUndetermined;

  // status 결정:
  //  - requireReview: COUNTER_OFFER (우리 검토 대기) — 토큰은 VIEWED 유지
  //  - 그 외: SENT → CONFIRMED, PARTIAL_RESENT → PARTIAL_REACCEPTED — 토큰 ACCEPTED
  const nextPoStatus = requireReview
    ? "COUNTER_OFFER"
    : po.status === "SENT"
      ? "CONFIRMED"
      : "PARTIAL_REACCEPTED";

  await prisma.$transaction(async (tx) => {
    // 1) 라인 단가 처리
    if (hasUndetermined) {
      const updates: Promise<unknown>[] = [];
      for (const it of undeterminedItems) {
        const proposed = proposalsMap.get(it.id)!;
        if (requireReview) {
          // 우리 검토 대기 — proposedUnitPrice 만 채우고 unitPrice/priceUndetermined 는 유지
          updates.push(
            tx.purchaseOrderItem.update({
              where: { id: it.id },
              data: {
                proposedUnitPrice: proposed,
                proposalStatus: "PENDING",
                proposalRespondedAt: null,
                proposalRejectionNote: null,
              },
            })
          );
        } else {
          // 즉시 적용 — unitPrice 갱신 + 미정 해제 + totalPrice 재계산
          const newTotal = proposed * Number(it.quantity);
          updates.push(
            tx.purchaseOrderItem.update({
              where: { id: it.id },
              data: {
                unitPrice: proposed,
                totalPrice: newTotal,
                priceUndetermined: false,
              },
            })
          );
        }
      }
      await Promise.all(updates);

      // 즉시 적용 시 totalAmount 재계산
      if (!requireReview) {
        const sumByItem = new Map<string, number>();
        for (const it of po.items) {
          const isUndet = undeterminedItems.some((u) => u.id === it.id);
          const unit = isUndet ? proposalsMap.get(it.id)! : Number(it.unitPrice);
          sumByItem.set(it.id, unit * Number(it.quantity));
        }
        const newTotal = Array.from(sumByItem.values()).reduce((s, v) => s + v, 0);
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { totalAmount: newTotal },
        });
      }
    }

    // 2) 토큰 상태 — requireReview 면 VIEWED 유지 (재진입 가능), 그 외엔 ACCEPTED
    if (!requireReview) {
      await tx.purchaseOrderAccessToken.update({
        where: { id: accessToken.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
    }

    // 3) PO status + 출고 정보 저장 (양쪽 흐름 공통)
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
        priceProposals: payload.priceProposals ?? [],
        requireReview,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    poStatus: nextPoStatus,
    requireReview,
  });
}
