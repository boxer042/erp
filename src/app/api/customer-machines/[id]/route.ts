import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, brand, modelNo, serialNo, productId, purchasedAt, purchasedFrom, memo } = body ?? {};
  const machine = await prisma.customerMachine.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(brand !== undefined ? { brand: brand?.trim() || null } : {}),
      ...(modelNo !== undefined ? { modelNo: modelNo?.trim() || null } : {}),
      ...(serialNo !== undefined ? { serialNo: serialNo?.trim() || null } : {}),
      ...(productId !== undefined ? { productId: productId || null } : {}),
      ...(purchasedAt !== undefined ? { purchasedAt: purchasedAt ? new Date(purchasedAt) : null } : {}),
      ...(purchasedFrom !== undefined ? { purchasedFrom: purchasedFrom?.trim() || null } : {}),
      ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
    },
  });
  return NextResponse.json(machine);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.customerMachine.update({
    where: { id },
    data: { isActive: false },
  });
  return NextResponse.json({ success: true });
}
