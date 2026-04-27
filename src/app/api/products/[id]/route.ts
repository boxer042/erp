import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validators/product";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      inventory: true,
      brandRef: { select: { id: true, name: true, logoUrl: true } },
      category: { select: { id: true, name: true } },
      bulkProduct: { select: { id: true, name: true, sku: true, containerSize: true, unitOfMeasure: true, sellingPrice: true } },
      productMappings: {
        include: {
          supplierProduct: {
            include: {
              supplier: { select: { id: true, name: true } },
              incomingCosts: { where: { isActive: true } },
            },
          },
        },
      },
      setComponents: {
        include: { component: { select: { id: true, name: true, sku: true } } },
      },
      channelPricings: {
        include: { channel: { select: { id: true, name: true, code: true } } },
      },
      sellingCosts: { where: { isActive: true } },
      variants: {
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          inventory: { select: { quantity: true } },
        },
      },
      canonicalProduct: { select: { id: true, name: true, sku: true } },
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      inventoryLots: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { receivedAt: "desc" },
        take: 10,
        include: {
          supplierProduct: { select: { id: true, name: true, supplier: { select: { name: true } } } },
        },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = productSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const isSet = data.productType === "SET" || data.productType === "ASSEMBLED";
  const newSellingPrice = parseFloat(data.sellingPrice);

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        name: data.name,
        brand: data.brand || null,
        brandId: data.brandId || null,
        modelName: data.modelName || null,
        spec: data.spec || null,
        containerSize: data.containerSize ? parseFloat(data.containerSize) : null,
        sku: data.sku,
        description: data.description || null,
        unitOfMeasure: data.unitOfMeasure,
        productType: data.productType,
        taxType: data.taxType,
        taxRate: parseFloat(data.taxRate),
        listPrice: parseFloat(data.listPrice ?? data.sellingPrice),
        sellingPrice: newSellingPrice,
        isSet,
        isBulk: data.isBulk ?? false,
        bulkProductId: data.bulkProductId || null,
        imageUrl: data.imageUrl ?? null,
        memo: data.memo || null,
        categoryId: data.categoryId || null,
      },
    });

    // 벌크 SKU 가격 자동 동기화 — 병 가격 ÷ containerSize
    if (updated.bulkProductId && updated.containerSize) {
      const containerSize = Number(updated.containerSize);
      if (containerSize > 0) {
        const bulkPrice = newSellingPrice / containerSize;
        await tx.product.update({
          where: { id: updated.bulkProductId },
          data: { listPrice: bulkPrice, sellingPrice: bulkPrice },
        });
      }
    }

    return updated;
  });

  return NextResponse.json(product);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.$transaction([
    // 관련 매핑 삭제
    prisma.productMapping.deleteMany({ where: { productId: id } }),
    // 상품 비활성화
    prisma.product.update({ where: { id }, data: { isActive: false } }),
  ]);
  return NextResponse.json({ success: true });
}
