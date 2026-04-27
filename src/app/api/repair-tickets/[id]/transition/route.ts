import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { genApprovalToken } from "@/lib/repair";
import { ensureBulkStock } from "@/lib/inventory/fifo";
import type { RepairApprovalMethod, OrderPaymentMethod } from "@prisma/client";

type Action = "quote" | "approve" | "request-approval" | "start" | "ready" | "pickup" | "cancel";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    if (action === "quote") {
      // 진단 + 견적 확정: 부품 + 공임 합산 → QUOTED
      const partsAmount = ticket.parts.reduce((s, p) => s + Number(p.totalPrice), 0);
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
      // 현장 승인
      const { approvedByName } = body ?? {};
      if (!["QUOTED", "RECEIVED", "DIAGNOSING"].includes(ticket.status)) {
        return NextResponse.json({ error: "견적 승인 단계가 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvalMethod: "ON_SITE" as RepairApprovalMethod,
          approvedAt: new Date(),
          approvedByName: approvedByName?.trim() || null,
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "start") {
      // 수리 착수 → APPROVED → REPAIRING. 여기서 FIFO 부품 차감.
      if (ticket.status !== "APPROVED") {
        return NextResponse.json({ error: "승인되지 않았습니다" }, { status: 400 });
      }
      await prisma.$transaction(async (tx) => {
        for (const part of ticket.parts) {
          if (part.consumedAt) continue; // 이미 차감됨
          await ensureBulkStock(tx, part.productId, Number(part.quantity), `수리 부품`);
          const lots = await tx.inventoryLot.findMany({
            where: { productId: part.productId, remainingQty: { gt: 0 } },
            orderBy: { receivedAt: "asc" },
          });
          const avail = lots.reduce((s, l) => s + Number(l.remainingQty), 0);
          if (avail < Number(part.quantity)) {
            throw new Error(`부품 재고 부족: 필요 ${part.quantity}, 가용 ${avail}`);
          }
          let need = Number(part.quantity);
          let totalCost = 0;
          for (const lot of lots) {
            if (need <= 0) break;
            const take = Math.min(need, Number(lot.remainingQty));
            await tx.inventoryLot.update({
              where: { id: lot.id },
              data: { remainingQty: { decrement: take } },
            });
            await tx.lotConsumption.create({
              data: { repairPartId: part.id, lotId: lot.id, quantity: take, unitCost: lot.unitCost },
            });
            totalCost += take * Number(lot.unitCost);
            need -= take;
          }
          const inv = await tx.inventory.update({
            where: { productId: part.productId },
            data: { quantity: { decrement: Number(part.quantity) } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: "OUTGOING",
              quantity: Number(part.quantity),
              balanceAfter: inv.quantity,
              referenceId: ticket.id,
              referenceType: "REPAIR_PART",
              memo: `수리 ${ticket.ticketNo} 부품 차감`,
            },
          });
          await tx.repairPart.update({
            where: { id: part.id },
            data: {
              consumedAt: new Date(),
              unitCostSnapshot: totalCost / Number(part.quantity),
            },
          });
        }
        await tx.repairTicket.update({
          where: { id },
          data: { status: "REPAIRING", startedAt: new Date() },
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === "ready") {
      if (ticket.status !== "REPAIRING") {
        return NextResponse.json({ error: "수리 중이 아닙니다" }, { status: 400 });
      }
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: { status: "READY", readyAt: new Date() },
      });
      return NextResponse.json(updated);
    }

    if (action === "pickup") {
      const { paymentMethod, finalAmount } = body ?? {};
      if (ticket.status !== "READY") {
        return NextResponse.json({ error: "픽업 대기 상태가 아닙니다" }, { status: 400 });
      }
      const finalAmt = finalAmount != null ? Number(finalAmount) : Number(ticket.quotedTotalAmount);
      const updated = await prisma.repairTicket.update({
        where: { id },
        data: {
          status: "PICKED_UP",
          pickedUpAt: new Date(),
          finalAmount: finalAmt,
          paymentMethod: (paymentMethod as OrderPaymentMethod) ?? null,
        },
      });
      // UNPAID면 고객원장에 매출 기록
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
      // 부품이 이미 차감됐으면 복원
      await prisma.$transaction(async (tx) => {
        for (const part of ticket.parts) {
          if (!part.consumedAt) continue;
          const consumptions = await tx.lotConsumption.findMany({
            where: { repairPartId: part.id },
          });
          for (const c of consumptions) {
            await tx.inventoryLot.update({
              where: { id: c.lotId },
              data: { remainingQty: { increment: c.quantity } },
            });
          }
          await tx.lotConsumption.deleteMany({ where: { repairPartId: part.id } });
          const inv = await tx.inventory.update({
            where: { productId: part.productId },
            data: { quantity: { increment: Number(part.quantity) } },
          });
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inv.id,
              type: "RETURN",
              quantity: Number(part.quantity),
              balanceAfter: inv.quantity,
              referenceId: ticket.id,
              referenceType: "REPAIR_CANCEL",
              memo: `수리 ${ticket.ticketNo} 취소 복원`,
            },
          });
          await tx.repairPart.update({
            where: { id: part.id },
            data: { consumedAt: null, unitCostSnapshot: null },
          });
        }
        await tx.repairTicket.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류" }, { status: 400 });
  }
}
