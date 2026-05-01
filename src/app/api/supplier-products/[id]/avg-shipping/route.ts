import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSupplierProductAvgShipping } from "@/lib/cost-utils";

/**
 * 공급상품의 평균 입고 배송비 (개당, VAT포함).
 * itemShippingCost(품목 직접 입력) > 분배 우선순위로 계산. 통합 헬퍼 사용.
 */
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
          id: true,
          totalPrice: true,
          quantity: true,
          itemShippingCost: true,
          itemShippingIsTaxable: true,
          incoming: {
            select: {
              shippingCost: true,
              shippingIsTaxable: true,
              shippingDeducted: true,
              items: {
                select: {
                  id: true,
                  totalPrice: true,
                  quantity: true,
                  itemShippingCost: true,
                  itemShippingIsTaxable: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sp) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { avgShippingCost, avgShippingIsTaxable } = computeSupplierProductAvgShipping(
    sp.incomingItems
  );
  return NextResponse.json({ avgShippingCost, avgShippingIsTaxable });
}
