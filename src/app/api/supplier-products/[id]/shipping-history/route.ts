import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeShippingPerUnitDisplay } from "@/lib/incoming-shipping";

/**
 * 공급상품의 최근 입고 배송비 이력.
 * 각 입고에서 그 공급상품 품목에 적용된 효과값(품목 직접 입력 / 전표 분배 / 0) + 출처 라벨.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const limit = parseInt(new URL(request.url).searchParams.get("limit") || "10", 10);

  const sp = await prisma.supplierProduct.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!sp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const myItems = await prisma.incomingItem.findMany({
    where: {
      supplierProductId: id,
      incoming: { status: "CONFIRMED" },
    },
    orderBy: { incoming: { incomingDate: "desc" } },
    take: limit,
    select: {
      id: true,
      quantity: true,
      totalPrice: true,
      itemShippingCost: true,
      itemShippingIsTaxable: true,
      incoming: {
        select: {
          id: true,
          incomingNo: true,
          incomingDate: true,
          shippingCost: true,
          shippingIsTaxable: true,
          shippingDeducted: true,
          items: {
            select: {
              id: true,
              quantity: true,
              totalPrice: true,
              itemShippingCost: true,
              itemShippingIsTaxable: true,
            },
          },
        },
      },
    },
  });

  const rows = myItems.map((it) => {
    const sib = it.incoming.items.map((s) => ({
      id: s.id,
      quantity: Number(s.quantity),
      totalPrice: Number(s.totalPrice),
      itemShippingCost:
        s.itemShippingCost === null || s.itemShippingCost === undefined ? null : Number(s.itemShippingCost),
      itemShippingIsTaxable: s.itemShippingIsTaxable,
    }));
    const map = computeShippingPerUnitDisplay(sib, {
      shippingCost: Number(it.incoming.shippingCost),
      shippingIsTaxable: it.incoming.shippingIsTaxable,
      shippingDeducted: it.incoming.shippingDeducted,
    });
    const eff = map.get(it.id);
    return {
      incomingItemId: it.id,
      incomingId: it.incoming.id,
      incomingNo: it.incoming.incomingNo,
      incomingDate: it.incoming.incomingDate,
      quantity: Number(it.quantity).toString(),
      perUnitShipping: eff ? eff.perUnit : 0,
      isTaxable: eff ? eff.isTaxable : it.incoming.shippingIsTaxable,
      source: eff ? eff.source : "ZERO",
      itemShippingCost: it.itemShippingCost?.toString() ?? null,
      itemShippingIsTaxable: it.itemShippingIsTaxable,
    };
  });

  return NextResponse.json(rows);
}
