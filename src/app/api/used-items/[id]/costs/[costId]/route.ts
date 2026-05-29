import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ id: string; costId: string }>;
}

/**
 * DELETE /api/used-items/[id]/costs/[costId] — 비용 가산 1건 삭제
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id, costId } = await params;
  const cost = await prisma.usedItemCost.findUnique({
    where: { id: costId },
    select: { id: true, usedItemId: true },
  });
  if (!cost || cost.usedItemId !== id) {
    return NextResponse.json({ error: "비용 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.usedItemCost.delete({ where: { id: costId } });
  return NextResponse.json({ ok: true });
}
