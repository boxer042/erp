import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const proposeSchema = z.object({
  changes: z
    .array(
      z.object({
        itemId: z.string().min(1),
        proposedUnitPrice: z.number().nonnegative(),
      })
    )
    .min(1, "변경할 항목이 1건 이상 있어야 합니다"),
});

/**
 * 거래처가 단가 변경 요청 — 인증 우회.
 *
 * - 토큰 ACTIVE/VIEWED 일 때만 허용
 * - 발주 status SENT 또는 PARTIAL_RESENT 일 때만 가능 (수락 대기 중)
 * - 항목별 proposedUnitPrice 저장
 * - 발주 status → COUNTER_OFFER (사용자 측에서 수락/거절 결정 대기)
 * - 토큰은 그대로 ACTIVE/VIEWED 유지 (거래처가 협상 결과를 다시 확인할 수 있게)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // CSRF 약식 방어
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: "잘못된 요청 출처입니다" }, { status: 403 });
  }

  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const accessToken = await prisma.purchaseOrderAccessToken.findUnique({
    where: { token },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          poNo: true,
          status: true,
          items: { select: { id: true, unitPrice: true } },
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
      { error: "이미 처리되었거나 사용할 수 없는 링크입니다" },
      { status: 409 }
    );
  }

  const po = accessToken.purchaseOrder;
  if (!["SENT", "PARTIAL_RESENT"].includes(po.status)) {
    return NextResponse.json(
      { error: "현재 발주 상태에서는 단가 변경 요청을 보낼 수 없습니다" },
      { status: 409 }
    );
  }

  // 모든 itemId 가 이 발주에 속하는지 검증
  const itemIds = new Set(po.items.map((i) => i.id));
  const invalid = parsed.data.changes.find((c) => !itemIds.has(c.itemId));
  if (invalid) {
    return NextResponse.json(
      { error: "발주에 속하지 않은 항목이 있습니다" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // 새 협상 시작 — 이전 라운드 결과 (ACCEPTED/REJECTED) 가 있으면 초기화
    await tx.purchaseOrderItem.updateMany({
      where: { purchaseOrderId: po.id, proposalStatus: { in: ["ACCEPTED", "REJECTED"] } },
      data: {
        proposalStatus: "NONE",
        proposalRespondedAt: null,
        proposalRejectionNote: null,
        proposedUnitPrice: null,
      },
    });

    // 항목별 proposedUnitPrice 갱신 + PENDING 설정
    await Promise.all(
      parsed.data.changes.map((c) =>
        tx.purchaseOrderItem.update({
          where: { id: c.itemId },
          data: {
            proposedUnitPrice: c.proposedUnitPrice,
            proposalStatus: "PENDING",
            proposalRespondedAt: null,
            proposalRejectionNote: null,
          },
        })
      )
    );
    // 발주 status COUNTER_OFFER 로 전환
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "COUNTER_OFFER" },
    });
    await recordAudit(tx, {
      userId: null,
      entity: "PurchaseOrder",
      entityId: po.id,
      action: "STATUS_CHANGE",
      meta: {
        from: po.status,
        to: "COUNTER_OFFER",
        via: "external_token",
        tokenId: accessToken.id,
        poNo: po.poNo,
        changes: parsed.data.changes.map((c) => {
          const original = po.items.find((i) => i.id === c.itemId);
          return {
            itemId: c.itemId,
            originalUnitPrice: original ? Number(original.unitPrice) : null,
            proposedUnitPrice: c.proposedUnitPrice,
          };
        }),
      },
    });
  });

  return NextResponse.json({ ok: true, poStatus: "COUNTER_OFFER" });
}
