import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairPartCreateSchema } from "@/lib/validators/repair-ticket";
import { consumeRepairPart } from "@/lib/repair-inventory";
import { Prisma } from "@prisma/client";

// 수리 티켓에 부속 추가 — 추가 즉시 FIFO 재고 차감
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = repairPartCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    select: { id: true, ticketNo: true, status: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "수리 티켓을 찾을 수 없습니다" }, { status: 404 });
  }
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 부속을 추가할 수 없습니다" },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    select: { id: true, name: true, sku: true },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 같은 productId 행이 이미 있으면 수량 증가 (카트 패턴)
      const existing = await tx.repairPart.findFirst({
        where: { repairTicketId: id, productId: data.productId, status: data.status },
      });

      if (existing) {
        const additionalQty = data.quantity;
        // 추가 분량만큼 FIFO 차감
        await consumeRepairPart(tx, existing.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: product.id,
          productName: product.name,
          quantity: additionalQty,
        });
        // 수량/총액 업데이트 (existing.consumedAt은 consumeRepairPart에서 갱신됨)
        const newQty = new Prisma.Decimal(existing.quantity).plus(additionalQty);
        const newTotal = newQty.times(existing.unitPrice);
        const updated = await tx.repairPart.update({
          where: { id: existing.id },
          data: {
            quantity: newQty,
            totalPrice: newTotal,
          },
          include: { product: { select: { id: true, name: true, sku: true } } },
        });
        return updated;
      }

      // 신규 행
      const part = await tx.repairPart.create({
        data: {
          repairTicketId: id,
          productId: data.productId,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalPrice: data.quantity * data.unitPrice,
          discount: data.discount,
          status: data.status,
        },
      });

      await consumeRepairPart(tx, part.id, {
        ticketId: ticket.id,
        ticketNo: ticket.ticketNo,
        productId: product.id,
        productName: product.name,
        quantity: data.quantity,
      });

      return tx.repairPart.findUnique({
        where: { id: part.id },
        include: { product: { select: { id: true, name: true, sku: true } } },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "부속 추가 실패" },
      { status: 400 },
    );
  }
}
