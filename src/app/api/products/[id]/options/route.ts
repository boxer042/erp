/**
 * Product 옵션 (ProductOption) — list + create.
 *
 * 정책:
 *  - GET: 해당 product 의 옵션 목록 (값 포함, sortOrder 순)
 *  - POST: 새 옵션 슬롯 + 값들 생성
 *  - 옵션값마다 mappedProductId / mappedVariantId 셋 중 최대 하나 (둘 다 null 도 허용)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { productOptionCreateSchema } from "@/lib/validators/product-option";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const options = await prisma.productOption.findMany({
    where: { productId: id, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      values: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          mappedProduct: { select: { id: true, name: true, sku: true, sellingPrice: true, listPrice: true, taxType: true, imageUrl: true } },
          mappedVariant: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });
  return NextResponse.json(options);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = productOptionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 옵션값 검증 — mappedProductId/mappedVariantId 둘 다 들어오면 거부
  for (const v of data.values) {
    if (v.mappedProductId && v.mappedVariantId) {
      return NextResponse.json(
        {
          error: `옵션값 "${v.label}": mappedProductId / mappedVariantId 둘 중 하나만 설정 가능`,
        },
        { status: 400 },
      );
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const option = await tx.productOption.create({
      data: {
        productId: id,
        name: data.name,
        required: data.required,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        values: {
          create: data.values.map((v) => ({
            label: v.label,
            addPrice: v.addPrice,
            sortOrder: v.sortOrder,
            isActive: v.isActive,
            mappedProductId: v.mappedProductId ?? null,
            mappedVariantId: v.mappedVariantId ?? null,
            mappedMode: v.mappedMode,
          })),
        },
      },
      include: {
        values: {
          orderBy: { sortOrder: "asc" },
          include: {
            mappedProduct: { select: { id: true, name: true, sku: true } },
            mappedVariant: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    await recordAudit(tx, {
      userId: user.id,
      entity: "ProductOption",
      entityId: option.id,
      action: "CREATE",
      meta: {
        productId: id,
        productName: product.name,
        optionName: option.name,
        valueCount: option.values.length,
      },
    });
    return option;
  });

  return NextResponse.json(created, { status: 201 });
}
