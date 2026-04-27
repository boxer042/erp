import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, brand, modelNo, serialNo, productId, dailyRate, monthlyRate, depositAmount, memo, status } = body ?? {};
  const asset = await prisma.rentalAsset.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(brand !== undefined ? { brand: brand?.trim() || null } : {}),
      ...(modelNo !== undefined ? { modelNo: modelNo?.trim() || null } : {}),
      ...(serialNo !== undefined ? { serialNo: serialNo?.trim() || null } : {}),
      ...(productId !== undefined ? { productId: productId || null } : {}),
      ...(dailyRate !== undefined ? { dailyRate: Number(dailyRate) } : {}),
      ...(monthlyRate !== undefined ? { monthlyRate: Number(monthlyRate) } : {}),
      ...(depositAmount !== undefined ? { depositAmount: Number(depositAmount) } : {}),
      ...(memo !== undefined ? { memo: memo?.trim() || null } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });
  return NextResponse.json(asset);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.rentalAsset.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
