import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 공급상품의 과거 확정 입고 unitCostSnapshot 수량 가중평균 반환
// (최근 50건만 — 오래된 데이터 영향 줄임)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const items = await prisma.incomingItem.findMany({
    where: {
      supplierProductId: id,
      incoming: { status: "CONFIRMED" },
      unitCostSnapshot: { not: null },
    },
    select: {
      unitCostSnapshot: true,
      quantity: true,
    },
    orderBy: { incoming: { incomingDate: "desc" } },
    take: 50,
  });

  if (items.length === 0) {
    return NextResponse.json({ avgUnitCost: null, sampleSize: 0 });
  }

  let totalQty = 0;
  let totalValue = 0;
  for (const item of items) {
    const qty = Number(item.quantity);
    const cost = item.unitCostSnapshot != null ? Number(item.unitCostSnapshot) : 0;
    totalQty += qty;
    totalValue += qty * cost;
  }
  const avgUnitCost = totalQty > 0 ? totalValue / totalQty : 0;

  return NextResponse.json({ avgUnitCost, sampleSize: items.length });
}
