import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pkg = await prisma.repairPackage.findUnique({
    where: { id },
    include: {
      labors: { include: { laborPreset: true }, orderBy: { sortOrder: "asc" } },
      parts: { include: { product: { select: { id: true, name: true, sku: true, sellingPrice: true } } } },
    },
  });
  if (!pkg) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  return NextResponse.json(pkg);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const { name, description, memo } = body ?? {};
  const pkg = await prisma.repairPackage.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
    },
  });
  return NextResponse.json(pkg);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  await prisma.repairPackage.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
