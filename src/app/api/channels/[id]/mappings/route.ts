/**
 * GET  /api/channels/[id]/mappings  — 채널 SKU 매핑 목록
 * POST /api/channels/[id]/mappings  — 신규 매핑 추가 (channelSku ↔ productId)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const createMappingSchema = z.object({
  channelSku: z.string().min(1, "채널 SKU 를 입력해주세요"),
  channelName: z.string().optional(),
  productId: z.string().min(1, "ERP 상품을 선택해주세요"),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: channelId } = await params;
  const mappings = await prisma.channelProductMapping.findMany({
    where: { channelId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(mappings);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id: channelId } = await params;
  const body = await request.json();
  const parsed = createMappingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // 채널·상품 존재 검증 (FK 위반보다 친절한 에러)
  const [channel, product] = await Promise.all([
    prisma.salesChannel.findUnique({
      where: { id: channelId },
      select: { id: true },
    }),
    prisma.product.findUnique({
      where: { id: data.productId },
      select: { id: true },
    }),
  ]);
  if (!channel) {
    return NextResponse.json(
      { error: "채널을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  if (!product) {
    return NextResponse.json(
      { error: "상품을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  try {
    const mapping = await prisma.channelProductMapping.create({
      data: {
        channelId,
        channelSku: data.channelSku,
        channelName: data.channelName ?? null,
        productId: data.productId,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
    return NextResponse.json(mapping, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "이미 매핑된 채널 SKU 입니다" },
        { status: 409 },
      );
    }
    throw e;
  }
}
