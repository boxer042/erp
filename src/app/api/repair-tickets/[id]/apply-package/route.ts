import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { consumeRepairPart } from "@/lib/repair-inventory";
import { z } from "zod";

const bodySchema = z.object({
  packageId: z.string().min(1),
});

/**
 * 수리 패키지를 티켓에 일괄 적용 — 패키지의 부속·공임을 한 번에 추가.
 * 부속은 즉시 FIFO 차감.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    select: { id: true, ticketNo: true, status: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "수리 티켓을 찾을 수 없습니다" }, { status: 404 });
  }
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 패키지 적용할 수 없습니다" },
      { status: 400 },
    );
  }

  const pkg = await prisma.repairPackage.findUnique({
    where: { id: parsed.data.packageId },
    include: {
      labors: { orderBy: { sortOrder: "asc" } },
      parts: {
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
  });
  if (!pkg) {
    return NextResponse.json({ error: "패키지를 찾을 수 없습니다" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1) 부속 — 즉시 차감
      for (const pp of pkg.parts) {
        const qty = Number(pp.quantity);
        const part = await tx.repairPart.create({
          data: {
            repairTicketId: id,
            productId: pp.productId,
            quantity: qty,
            unitPrice: pp.unitPrice,
            totalPrice: Number(pp.unitPrice) * qty,
            status: "USED",
          },
        });
        await consumeRepairPart(tx, part.id, {
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          productId: pp.productId,
          productName: pp.product.name,
          quantity: qty,
        });
      }
      // 2) 공임
      for (const pl of pkg.labors) {
        const hours = pl.quantity ?? 1;
        await tx.repairLabor.create({
          data: {
            repairTicketId: id,
            name: pl.name,
            hours,
            unitRate: pl.unitRate,
            totalPrice: Number(pl.unitRate) * hours,
          },
        });
      }
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "패키지 적용 실패" },
      { status: 400 },
    );
  }
}
