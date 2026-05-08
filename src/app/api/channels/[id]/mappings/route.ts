/**
 * GET  /api/channels/[id]/mappings  — 채널 SKU 매핑 목록
 * POST /api/channels/[id]/mappings  — 신규 매핑 추가 (channelSku ↔ productId)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

/**
 * 매핑 생성 입력. 단일/다중 둘 중 하나 형태:
 *  - 단일: productId 직접 (가장 흔한 케이스)
 *  - 다중: components 배열 (세트·번들 풀기)
 */
const createMappingSchema = z
  .object({
    channelSku: z.string().min(1, "채널 SKU 를 입력해주세요"),
    channelName: z.string().optional(),
    productId: z.string().optional(),
    components: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().positive(),
        }),
      )
      .optional(),
  })
  .refine(
    (d) =>
      (d.productId && d.productId.length > 0) ||
      (d.components && d.components.length > 0),
    "productId 또는 components 중 하나는 필수입니다",
  );

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: channelId } = await params;
  const mappings = await prisma.channelProductMapping.findMany({
    where: { channelId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      components: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
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

  // 채널 존재 검증
  const channel = await prisma.salesChannel.findUnique({
    where: { id: channelId },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json(
      { error: "채널을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  // 상품 존재 검증 (단일·다중 모두 대상)
  const productIds = data.components
    ? data.components.map((c) => c.productId)
    : data.productId
      ? [data.productId]
      : [];
  if (productIds.length > 0) {
    const found = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((p) => p.id));
    const missing = productIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `상품을 찾을 수 없습니다: ${missing.join(", ")}` },
        { status: 404 },
      );
    }
  }

  try {
    const mapping = await prisma.channelProductMapping.create({
      data: {
        channelId,
        channelSku: data.channelSku,
        channelName: data.channelName ?? null,
        // 다중이면 productId=null + components, 단일이면 productId 만
        ...(data.components && data.components.length > 0
          ? {
              productId: null,
              components: {
                create: data.components.map((c) => ({
                  productId: c.productId,
                  quantity: c.quantity,
                })),
              },
            }
          : { productId: data.productId }),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        components: {
          include: {
            product: { select: { id: true, name: true, sku: true } },
          },
        },
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
