import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { productId, quantity, unitPrice } = body ?? {};
  if (!productId || !quantity || !unitPrice) {
    return NextResponse.json({ error: "productId, quantity, unitPrice 필수" }, { status: 400 });
  }
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const part = await prisma.repairPart.create({
    data: {
      repairTicketId: id,
      productId,
      quantity: qty,
      unitPrice: price,
      totalPrice: qty * price,
    },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  return NextResponse.json(part, { status: 201 });
}
