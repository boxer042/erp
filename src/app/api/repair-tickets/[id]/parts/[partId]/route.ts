import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairPartUpdateSchema } from "@/lib/validators/repair-ticket";
import { consumeRepairPart, restoreRepairPart } from "@/lib/repair-inventory";
import { Prisma } from "@prisma/client";

// 부속 행 수정 — 수량/단가/할인/상태(USED↔LOST) 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { partId } = await params;
  const body = await request.json();
  const parsed = repairPartUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const part = await prisma.repairPart.findUnique({
    where: { id: partId },
    include: {
      repairTicket: { select: { id: true, ticketNo: true, status: true } },
      product: { select: { id: true, name: true } },
    },
  });
  if (!part) {
    return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  }
  const ticket = part.repairTicket;
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 수정할 수 없습니다" },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const oldQty = Number(part.quantity);
      const newQty = data.quantity != null ? Number(data.quantity) : oldQty;
      const newPrice = data.unitPrice != null ? Number(data.unitPrice) : Number(part.unitPrice);

      // 수량 변경 — 차이만큼 추가 차감 또는 부분 복원
      if (newQty > oldQty) {
        const delta = newQty - oldQty;
        await consumeRepairPart(tx, part.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: part.productId,
          productName: part.product.name,
          quantity: delta,
        });
      } else if (newQty < oldQty) {
        // 부분 복원 — 단순화: 전체 복원 후 새 수량으로 재차감
        await restoreRepairPart(tx, part.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: part.productId,
          productName: part.product.name,
          quantity: oldQty,
          reason: "수량 변경",
        });
        if (newQty > 0) {
          await consumeRepairPart(tx, part.id, {
            ticketId: ticket.id,
            ticketNo: ticket.ticketNo,
            productId: part.productId,
            productName: part.product.name,
            quantity: newQty,
          });
        }
      }

      const updated = await tx.repairPart.update({
        where: { id: part.id },
        data: {
          quantity: new Prisma.Decimal(newQty),
          unitPrice: new Prisma.Decimal(newPrice),
          totalPrice: new Prisma.Decimal(newQty).times(newPrice),
          ...(data.discount !== undefined ? { discount: data.discount } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
        },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "수정 실패" },
      { status: 400 },
    );
  }
}

// 부속 행 삭제 — 차감된 재고 복원
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { partId } = await params;
  const part = await prisma.repairPart.findUnique({
    where: { id: partId },
    include: {
      repairTicket: { select: { id: true, ticketNo: true, status: true } },
      product: { select: { id: true, name: true } },
    },
  });
  if (!part) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });

  const ticket = part.repairTicket;
  if (ticket.status === "PICKED_UP") {
    return NextResponse.json(
      { error: "완료된 수리는 부속을 삭제할 수 없습니다" },
      { status: 400 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (part.consumedAt) {
        await restoreRepairPart(tx, part.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: part.productId,
          productName: part.product.name,
          quantity: Number(part.quantity),
          reason: "부속 행 삭제",
        });
      }
      await tx.repairPart.delete({ where: { id: partId } });
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
