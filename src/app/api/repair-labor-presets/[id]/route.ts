import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const { name, description, unitRate, memo } = body ?? {};
  const preset = await prisma.repairLaborPreset.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(unitRate !== undefined ? { unitRate: parseFloat(String(unitRate)) || 0 } : {}),
      ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
    },
  });
  return NextResponse.json(preset);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  await prisma.repairLaborPreset.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
