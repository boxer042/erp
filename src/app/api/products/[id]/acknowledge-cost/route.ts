import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { computeCurrentUnitCostForId } from "@/lib/product-cost";
import { guardUser } from "@/lib/api-auth";

/**
 * 원가 변동 안내 배지를 "확인" 처리 — Product.acknowledgedUnitCost 를 현재 unitCost 로 동기화.
 * 판매가 수정은 PUT /api/products/[id] 가 같은 동기화를 수행하므로 그쪽이 우선.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const user = await getCurrentUser();

  const current = await computeCurrentUnitCostForId(prisma, id);

  const updated = await prisma.product.update({
    where: { id },
    data: {
      acknowledgedUnitCost: current,
      acknowledgedAt: new Date(),
      acknowledgedById: user?.id ?? null,
    },
    select: {
      id: true,
      acknowledgedUnitCost: true,
      acknowledgedAt: true,
    },
  });

  return NextResponse.json(updated);
}
