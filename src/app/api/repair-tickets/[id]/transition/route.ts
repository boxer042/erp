import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { calcRepairTotals, genApprovalToken } from "@/lib/repair";
import { restoreRepairPart } from "@/lib/repair-inventory";
import type { RepairApprovalMethod, OrderPaymentMethod } from "@prisma/client";

type Action =
  | "diagnose"
  | "quote"
  | "approve"
  | "request-approval"
  | "start"
  | "ready"
  | "pickup"
  | "cancel";

// 부속·공임 합계 → 수리 보증 만료 = 픽업 시점 + repairWarrantyMonths
function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = (request.nextUrl.searchParams.get("action") || body?.action) as Action;
  if (!action) return NextResponse.json({ error: "action 필수" }, { status: 400 });

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    include: { parts: true, labors: true },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  try {
    if (action === "diagnose") {
      // RECEIVED → DIAGNOSING (DROP_OFF만 의미. ON_SITE는 보통 스킵)
      if (ticket.status !== "RECEIVED") {
        return NextResponse.json(
          { error: "접수 상태에서만 진단 시작 가능합니다" },
          { status: 400 },
        );
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "DIAGNOSING" },
      });
      return NextResponse.json(updated);
    }

    if (action === "quote") {
      // 견적 확정: USED 부속만 합산, 공임 합산 → QUOTED
      if (!["RECEIVED", "DIAGNOSING", "QUOTED"].includes(ticket.status)) {
        return NextResponse.json(
          { error: "견적 확정 가능한 상태가 아닙니다" },
          { status: 400 },
        );
      }
      const partsAmount = ticket.parts
        .filter((p) => p.status === "USED")
        .reduce((s, p) => s + Number(p.totalPrice), 0);
      const laborAmount = ticket.labors.reduce((s, l) => s + Number(l.totalPrice), 0);
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "QUOTED",
          quotedPartsAmount: partsAmount,
          quotedLaborAmount: laborAmount,
          quotedTotalAmount: partsAmount + laborAmount,
          quotedAt: new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "request-approval") {
      // 견적 확정된 티켓에 대해서만 원격 승인 토큰 발급
      if (ticket.status !== "QUOTED") {
        return NextResponse.json(
          { error: "견적 확정 후에만 승인 링크를 발급할 수 있습니다" },
          { status: 400 },
        );
      }
      const token = genApprovalToken();
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          approvalMethod: "REMOTE" as RepairApprovalMethod,
          approvalToken: token,
          approvalTokenExpiresAt: expires,
        },
      });
      return NextResponse.json({
        ticketNo: updated.ticketNo,
        approvalToken: token,
        approvalUrl: `${request.nextUrl.origin}/repair/approve/${token}`,
      });
    }

    if (action === "approve") {
      const { approvedByName } = body ?? {};
      if (!["QUOTED", "RECEIVED", "DIAGNOSING"].includes(ticket.status)) {
        return NextResponse.json({ error: "견적 승인 단계가 아닙니다" }, { status: 400 });
      }
      // 현장 승인 시 발급돼 있던 원격 승인 토큰은 더 이상 유효하지 않으므로 무효화
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvalMethod: "ON_SITE" as RepairApprovalMethod,
          approvedAt: new Date(),
          approvedByName: approvedByName?.trim() || null,
          approvalToken: null,
          approvalTokenExpiresAt: null,
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "start") {
      // 수리 착수 — 부속은 추가 시점에 이미 차감됐으니 여기선 상태만 전환
      if (!["APPROVED", "RECEIVED", "DIAGNOSING"].includes(ticket.status)) {
        return NextResponse.json({ error: "수리 시작 가능한 상태가 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "REPAIRING", startedAt: ticket.startedAt ?? new Date() },
      });
      return NextResponse.json(updated);
    }

    if (action === "ready") {
      if (!["REPAIRING", "APPROVED"].includes(ticket.status)) {
        return NextResponse.json({ error: "수리 중이 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "READY", readyAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    if (action === "pickup") {
      // 픽업 + 결제 — finalAmount는 항상 서버에서 calcRepairTotals 로 재계산 (클라이언트 입력 신뢰 안 함).
      // 클라이언트에 보낸 값은 사용 안 하지만, 호출 측이 표시용으로 보내는 건 허용.
      const { paymentMethod } = body ?? {};
      if (!["READY", "REPAIRING"].includes(ticket.status)) {
        return NextResponse.json({ error: "픽업 단계가 아닙니다" }, { status: 400 });
      }
      const totals = calcRepairTotals({
        parts: ticket.parts,
        labors: ticket.labors,
        diagnosisFee: ticket.diagnosisFee,
        totalDiscount: ticket.totalDiscount,
      });
      const finalAmt = totals.finalTotal; // calcRepairTotals 가 이미 Math.max(0, ...) 적용

      // 보증 만료 계산 — repairWarrantyMonths가 설정돼 있을 때만
      const pickupAt = new Date();
      const warrantyEnds =
        ticket.repairWarrantyMonths != null && ticket.repairWarrantyMonths > 0
          ? addMonths(pickupAt, ticket.repairWarrantyMonths)
          : null;

      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "PICKED_UP",
          pickedUpAt: pickupAt,
          finalAmount: finalAmt,
          paymentMethod: (paymentMethod as OrderPaymentMethod) ?? null,
          repairWarrantyEnds: warrantyEnds,
          // 픽업 후 원격 승인 토큰은 더 이상 의미 없음 — 일회용 보장
          approvalToken: null,
          approvalTokenExpiresAt: null,
        },
      });

      if (paymentMethod === "UNPAID" && ticket.customerId) {
        const last = await prisma.customerLedger.findFirst({
          where: { customerId: ticket.customerId },
          orderBy: { date: "desc" },
        });
        const prevBalance = last ? Number(last.balance) : 0;
        await prisma.customerLedger.create({
          data: {
            customerId: ticket.customerId,
            type: "SALE",
            description: `수리 ${ticket.ticketNo}`,
            debitAmount: finalAmt,
            creditAmount: 0,
            balance: prevBalance + finalAmt,
            referenceId: ticket.id,
            referenceType: "REPAIR_TICKET",
          },
        });
      }
      return NextResponse.json(updated);
    }

    if (action === "cancel") {
      // 취소 불가 상태 — 데이터 무결성 보호
      if (ticket.status === "PICKED_UP") {
        return NextResponse.json(
          { error: "이미 픽업/결제가 완료된 수리는 취소할 수 없습니다" },
          { status: 400 },
        );
      }
      if (ticket.status === "CANCELLED") {
        return NextResponse.json(
          { error: "이미 취소된 수리입니다" },
          { status: 400 },
        );
      }
      if (ticket.status === "READY") {
        return NextResponse.json(
          { error: "인계대기 상태는 취소할 수 없습니다. 픽업/결제로 마무리하세요" },
          { status: 400 },
        );
      }
      // 거절·취소 — USED 부속만 재고 복원. LOST 는 이미 손실 처리된 부속이므로 그대로 남김
      // (다시 차감되면 손실 추적이 어긋남). 진단비만 청구.
      // 토큰은 더 이상 의미 없으므로 정리.
      await prisma.$transaction(async (tx) => {
        for (const part of ticket.parts) {
          if (part.status !== "USED") continue;
          if (!part.consumedAt) continue;
          await restoreRepairPart(tx, part.id, {
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            productId: part.productId,
            productName: "수리 부속",
            quantity: Number(part.quantity),
            reason: "수리 취소",
          });
          await tx.repairPart.update({
            where: { id: part.id },
            data: { consumedAt: null, unitCostSnapshot: null },
          });
        }
        await tx.repairTicket.update({
          where: { id },
          data: {
            status: "CANCELLED",
            approvalToken: null,
            approvalTokenExpiresAt: null,
          },
        });
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "오류" },
      { status: 400 },
    );
  }
}
