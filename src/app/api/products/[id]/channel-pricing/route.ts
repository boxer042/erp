import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pricings = await prisma.channelPricing.findMany({
    where: { productId: id, isActive: true },
    include: { channel: { select: { name: true, code: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(pricings);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const { channelId, sellingPrice } = body as {
    channelId: string;
    sellingPrice: string;
  };

  if (!channelId || !sellingPrice) {
    return NextResponse.json({ error: "채널과 판매가를 입력해주세요" }, { status: 400 });
  }

  // upsert: 기존 매핑이 있으면 업데이트
  const pricing = await prisma.channelPricing.upsert({
    where: { productId_channelId: { productId: id, channelId } },
    update: { sellingPrice: parseFloat(sellingPrice), isActive: true },
    create: {
      productId: id,
      channelId,
      sellingPrice: parseFloat(sellingPrice),
    },
    include: { channel: { select: { name: true, code: true } } },
  });

  return NextResponse.json(pricing, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const pricingId = searchParams.get("pricingId");

  if (!pricingId) {
    return NextResponse.json({ error: "pricingId가 필요합니다" }, { status: 400 });
  }

  await prisma.channelPricing.update({
    where: { id: pricingId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
