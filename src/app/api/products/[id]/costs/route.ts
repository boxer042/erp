import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const channelIdParam = searchParams.get("channelId");

  const where: {
    productId: string;
    isActive: boolean;
    channelId?: string | null;
  } = { productId: id, isActive: true };

  if (channelIdParam === "null") {
    where.channelId = null;
  } else if (channelIdParam) {
    where.channelId = channelIdParam;
  }

  const costs = await prisma.sellingCost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      channel: { select: { id: true, name: true, code: true } },
    },
  });
  return NextResponse.json(costs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const { name, costType, value, perUnit, isTaxable, channelId } = body as {
    name: string;
    costType: "PERCENTAGE" | "FIXED";
    value: string;
    perUnit: boolean;
    isTaxable: boolean;
    channelId?: string | null;
  };

  if (!name || !value) {
    return NextResponse.json({ error: "이름과 값을 입력해주세요" }, { status: 400 });
  }

  const cost = await prisma.sellingCost.create({
    data: {
      productId: id,
      channelId: channelId ?? null,
      name,
      costType,
      value: parseFloat(value),
      perUnit,
      isTaxable: isTaxable ?? true,
    },
    include: {
      channel: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(cost, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  _context: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const costId = searchParams.get("costId");

  if (!costId) {
    return NextResponse.json({ error: "costId가 필요합니다" }, { status: 400 });
  }

  await prisma.sellingCost.update({
    where: { id: costId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
