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
  const { productId, quantity, unitPrice } = body ?? {};
  if (!productId || quantity === undefined || unitPrice === undefined) {
    return NextResponse.json({ error: "상품, 수량, 단가는 필수입니다" }, { status: 400 });
  }
  const part = await prisma.repairPackagePart.create({
    data: {
      packageId,
      productId,
      quantity: parseFloat(String(quantity)) || 1,
      unitPrice: parseFloat(String(unitPrice)) || 0,
    },
    include: { product: { select: { id: true, name: true, sku: true } } },
  });
  return NextResponse.json(part, { status: 201 });
}
