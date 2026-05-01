import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalcIncomingShippingSnapshots, recalcIncomingExpense } from "@/lib/incoming-recalc";

/**
 * 단일 IncomingItem 의 itemShippingCost / itemShippingIsTaxable 만 수정.
 * 같은 전표의 다른 품목 분배도 함께 재계산되어 unitCostSnapshot + InventoryLot.unitCost 갱신.
 *
 * Body: { itemShippingCost: string | null, itemShippingIsTaxable?: boolean }
 *   - itemShippingCost null/"" → 분배 적용으로 되돌림
 *   - itemShippingCost 0 또는 양수 → 그 품목 한정 운임
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const raw = body?.itemShippingCost;
  const taxable = typeof body?.itemShippingIsTaxable === "boolean" ? body.itemShippingIsTaxable : undefined;

  const value =
    raw === null || raw === undefined || raw === ""
      ? null
      : (parseFloat(String(raw)) || 0);

  const item = await prisma.incomingItem.findUnique({
    where: { id },
    include: { incoming: { select: { id: true, status: true } } },
  });
  if (!item) {
    return NextResponse.json({ error: "입고 품목을 찾을 수 없습니다" }, { status: 404 });
  }
  if (item.incoming.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "확인된 입고의 품목만 배송비를 직접 수정할 수 있습니다" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.incomingItem.update({
      where: { id },
      data: {
        itemShippingCost: value,
        ...(taxable !== undefined ? { itemShippingIsTaxable: taxable } : {}),
      },
    });
    await recalcIncomingShippingSnapshots(tx, item.incoming.id);
    await recalcIncomingExpense(tx, item.incoming.id);
  });

  const updated = await prisma.incomingItem.findUnique({
    where: { id },
    select: {
      id: true,
      itemShippingCost: true,
      itemShippingIsTaxable: true,
      unitCostSnapshot: true,
    },
  });
  return NextResponse.json(updated);
}
