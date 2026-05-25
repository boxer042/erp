import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["accept", "reject"]),
  rejectionNote: z.string().max(500).optional(),
});

/**
 * 거래처가 제안한 단가 변경에 대한 우리(발주자) 측 응답.
 *
 * - accept: proposedUnitPrice → unitPrice 갱신, totalPrice 재계산, 발주 totalAmount 갱신,
 *           **status → SENT** (거래처가 출고 방법/납기일을 입력하는 [수락] 모달을 거치도록 회귀).
 *           가격이 정해진 라인은 priceUndetermined=false 로 해제.
 *           proposalStatus 는 ACCEPTED 로 마킹 (이력 표시 유지).
 *           기존 토큰은 그대로 유효 — 거래처가 같은 링크로 [수락] 다시 진행.
 * - reject: proposedUnitPrice 모두 null, status → SENT.
 *
 * 가드: 발주 status === COUNTER_OFFER 일 때만 허용.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true, accessTokens: { select: { id: true, status: true } } },
  });
  if (!po) {
    return NextResponse.json({ error: "발주서를 찾을 수 없습니다" }, { status: 404 });
  }
  if (po.status !== "COUNTER_OFFER") {
    return NextResponse.json(
      { error: "단가 협상 중인 발주만 처리할 수 있습니다" },
      { status: 409 }
    );
  }

  const itemsWithProposal = po.items.filter((it) => it.proposedUnitPrice != null);
  if (itemsWithProposal.length === 0) {
    return NextResponse.json(
      { error: "변경 요청된 항목이 없습니다" },
      { status: 400 }
    );
  }

  const respondedAt = new Date();
  await prisma.$transaction(async (tx) => {
    if (parsed.data.action === "accept") {
      // 모든 proposed 단가를 적용. proposedUnitPrice 는 보존 (이력 표시용).
      let newTotal = 0;
      const updates: Promise<unknown>[] = [];
      const auditChanges: Array<{
        itemId: string;
        oldUnitPrice: number;
        newUnitPrice: number;
      }> = [];

      for (const it of po.items) {
        const proposed = it.proposedUnitPrice != null ? Number(it.proposedUnitPrice) : null;
        const original = Number(it.unitPrice);
        const finalUnit = proposed ?? original;
        const lineTotal = finalUnit * Number(it.quantity);
        newTotal += lineTotal;
        if (proposed != null && proposed !== original) {
          auditChanges.push({ itemId: it.id, oldUnitPrice: original, newUnitPrice: proposed });
        }
        const isPending = it.proposalStatus === "PENDING";
        // 가격이 0 보다 크게 정해지면 priceUndetermined 해제.
        const clearedUndetermined = it.priceUndetermined && finalUnit > 0;
        updates.push(
          tx.purchaseOrderItem.update({
            where: { id: it.id },
            data: {
              unitPrice: finalUnit,
              totalPrice: lineTotal,
              ...(clearedUndetermined ? { priceUndetermined: false } : {}),
              ...(isPending
                ? { proposalStatus: "ACCEPTED", proposalRespondedAt: respondedAt }
                : {}),
            },
          })
        );
      }
      await Promise.all(updates);

      // status 결정:
      //  - 출고 정보(방법·납기일)가 이미 채워져 있으면 → 거래처 재확인 불필요, 즉시 CONFIRMED + 토큰 ACCEPTED
      //  - 없으면 → SENT 로 회귀해 거래처가 [수락] 모달에서 출고 정보 입력하도록
      const shippingAlreadySet = !!po.shippingMethod && !!po.promisedDate;
      const nextStatus = shippingAlreadySet ? "CONFIRMED" : "SENT";

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: nextStatus, totalAmount: newTotal },
      });

      // 출고 정보 완비 시 활성 토큰을 ACCEPTED 로 종결 (재진입 불필요)
      if (shippingAlreadySet) {
        const activeToken = po.accessTokens.find(
          (t) => t.status === "ACTIVE" || t.status === "VIEWED",
        );
        if (activeToken) {
          await tx.purchaseOrderAccessToken.update({
            where: { id: activeToken.id },
            data: { status: "ACCEPTED", acceptedAt: new Date() },
          });
        }
      }

      await recordAudit(tx, {
        userId: user.id,
        entity: "PurchaseOrder",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: "COUNTER_OFFER",
          to: nextStatus,
          action: "ACCEPT_PROPOSAL",
          poNo: po.poNo,
          newTotalAmount: newTotal,
          shippingAlreadySet,
          changes: auditChanges,
        },
      });
    } else {
      // reject: proposalStatus → REJECTED, proposedUnitPrice 보존, status → SENT
      await tx.purchaseOrderItem.updateMany({
        where: { purchaseOrderId: id, proposalStatus: "PENDING" },
        data: {
          proposalStatus: "REJECTED",
          proposalRespondedAt: respondedAt,
          proposalRejectionNote: parsed.data.rejectionNote ?? null,
        },
      });
      await tx.purchaseOrder.update({
        where: { id },
        data: { status: "SENT" },
      });
      await recordAudit(tx, {
        userId: user.id,
        entity: "PurchaseOrder",
        entityId: id,
        action: "STATUS_CHANGE",
        meta: {
          from: "COUNTER_OFFER",
          to: "SENT",
          action: "REJECT_PROPOSAL",
          poNo: po.poNo,
          rejectionNote: parsed.data.rejectionNote ?? null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
