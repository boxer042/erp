import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) return NextResponse.json({ error: "customerId 필수" }, { status: 400 });
  const machines = await prisma.customerMachine.findMany({
    where: { customerId, isActive: true },
    include: { product: { select: { id: true, name: true, sku: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(machines);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { customerId, name, brand, modelNo, serialNo, productId, purchasedAt, purchasedFrom, memo } = body ?? {};
  if (!customerId || !name?.trim()) {
    return NextResponse.json({ error: "customerId, name 필수" }, { status: 400 });
  }
  const machine = await prisma.customerMachine.create({
    data: {
      customerId,
      name: name.trim(),
      brand: brand?.trim() || null,
      modelNo: modelNo?.trim() || null,
      serialNo: serialNo?.trim() || null,
      productId: productId || null,
      purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
      purchasedFrom: purchasedFrom?.trim() || null,
      memo: memo?.trim() || null,
    },
  });
  return NextResponse.json(machine, { status: 201 });
}
