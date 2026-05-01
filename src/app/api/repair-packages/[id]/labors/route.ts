import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id: packageId } = await params;
  const body = await request.json();
  const { laborPresetId, name, unitRate, quantity } = body ?? {};
  if (!name?.trim() || unitRate === undefined) {
    return NextResponse.json({ error: "이름과 단가는 필수입니다" }, { status: 400 });
  }
  const count = await prisma.repairPackageLabor.count({ where: { packageId } });
  const labor = await prisma.repairPackageLabor.create({
    data: {
      packageId,
      laborPresetId: laborPresetId || null,
      name: name.trim(),
      unitRate: parseFloat(String(unitRate)) || 0,
      quantity: quantity ?? 1,
      sortOrder: count,
    },
  });
  return NextResponse.json(labor, { status: 201 });
}
