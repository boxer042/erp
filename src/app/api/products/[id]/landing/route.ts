import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { landingBlocksSchema } from "@/lib/validators/landing-block";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true, sku: true, imageUrl: true, landingBlocks: true },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const raw = product.landingBlocks ?? [];
  const parsed = landingBlocksSchema.safeParse(raw);
  return NextResponse.json({
    id: product.id,
    name: product.name,
    sku: product.sku,
    imageUrl: product.imageUrl,
    blocks: parsed.success ? parsed.data : [],
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = landingBlocksSchema.safeParse(body.blocks);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.product.update({
    where: { id },
    data: { landingBlocks: parsed.data },
  });
  return NextResponse.json({ blocks: parsed.data });
}
