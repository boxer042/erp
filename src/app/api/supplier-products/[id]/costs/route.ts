import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const costs = await prisma.incomingCost.findMany({
    where: { supplierProductId: id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(costs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, costType, value, perUnit, isTaxable } = body as {
    name: string;
    costType: "PERCENTAGE" | "FIXED";
    value: string;
    perUnit: boolean;
    isTaxable: boolean;
  };

  if (!name || !value) {
    return NextResponse.json({ error: "이름과 값을 입력해주세요" }, { status: 400 });
  }

  const cost = await prisma.incomingCost.create({
    data: {
      supplierProductId: id,
      name,
      costType,
      value: parseFloat(value),
      perUnit,
      isTaxable: isTaxable ?? true,
    },
  });

  return NextResponse.json(cost, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const costId = searchParams.get("costId");

  if (!costId) {
    return NextResponse.json({ error: "costId가 필요합니다" }, { status: 400 });
  }

  await prisma.incomingCost.update({
    where: { id: costId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
