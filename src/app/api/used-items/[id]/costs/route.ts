import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemCostSchema } from "@/lib/validators/used-item";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/used-items/[id]/costs — 비용 가산 1건 추가
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = usedItemCostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.usedItem.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.status !== "IN_STOCK") {
    return NextResponse.json(
      { error: "보관 중 상태가 아닌 단품에는 비용을 가산할 수 없습니다" },
      { status: 400 },
    );
  }

  const cost = await prisma.usedItemCost.create({
    data: {
      usedItemId: id,
      costType: parsed.data.costType,
      amount: parsed.data.amount,
      description: parsed.data.description,
      referenceType: parsed.data.referenceType ?? null,
      referenceId: parsed.data.referenceId ?? null,
      createdById: user!.id,
    },
  });

  return NextResponse.json(cost, { status: 201 });
}
