import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const sp = await prisma.supplierProduct.findUnique({
    where: { id },
    include: {
      incomingItems: {
        where: { incoming: { status: "CONFIRMED" } },
        select: {
          totalPrice: true,
          quantity: true,
          incoming: {
            select: {
              shippingCost: true,
              shippingIsTaxable: true,
              shippingDeducted: true,
              items: { select: { totalPrice: true } },
            },
          },
        },
      },
    },
  });

  if (!sp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allocations = sp.incomingItems
    .filter((item) => !item.incoming.shippingDeducted)
    .map((item) => {
      const incomingTotal = item.incoming.items.reduce(
        (sum, i) => sum + parseFloat(i.totalPrice.toString()),
        0
      );
      const shippingCost = parseFloat(item.incoming.shippingCost.toString());
      const qty = parseFloat(item.quantity.toString());
      if (incomingTotal === 0 || shippingCost === 0 || qty === 0) return { amount: 0, isTaxable: item.incoming.shippingIsTaxable };
      const lineShipping = (parseFloat(item.totalPrice.toString()) / incomingTotal) * shippingCost;
      const amount = lineShipping / qty;
      return { amount, isTaxable: item.incoming.shippingIsTaxable };
    });

  if (allocations.length === 0) {
    return NextResponse.json({ avgShippingCost: null, avgShippingIsTaxable: false });
  }

  const totalAmount = allocations.reduce((sum, a) => sum + a.amount, 0);
  const taxableAmount = allocations.reduce((sum, a) => sum + (a.isTaxable ? a.amount : 0), 0);
  const avgShippingCost = totalAmount / allocations.length;
  // 과세 비중이 50% 이상이면 과세로 표시
  const avgShippingIsTaxable = totalAmount > 0 ? taxableAmount / totalAmount >= 0.5 : false;

  return NextResponse.json({ avgShippingCost, avgShippingIsTaxable });
}
