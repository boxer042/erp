import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const qtyParam = searchParams.get("quantity");
  const qty = qtyParam ? Number(qtyParam) : 0;

  if (!productId) {
    return NextResponse.json({ error: "productId 필요" }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({
      productId,
      quantity: 0,
      totalCost: 0,
      available: 0,
      sufficient: false,
    });
  }

  const lots = await prisma.inventoryLot.findMany({
    where: { productId, remainingQty: { gt: 0 } },
    orderBy: { receivedAt: "asc" },
    select: { remainingQty: true, unitCost: true },
  });
  const available = lots.reduce((s, l) => s + Number(l.remainingQty), 0);

  let need = qty;
  let totalCost = 0;
  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(need, Number(lot.remainingQty));
    totalCost += take * Number(lot.unitCost);
    need -= take;
  }

  return NextResponse.json({
    productId,
    quantity: qty,
    available,
    sufficient: available >= qty,
    totalCost: available >= qty ? totalCost : 0,
  });
}
