import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const inventoryId = searchParams.get("inventoryId");

  // canonical(대표) 상품이면 자식 변형들의 movement 까지 합산해서 반환
  let productIds: string[] | null = null;
  if (productId) {
    const target = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        isCanonical: true,
        variants: { where: { isActive: true }, select: { id: true } },
      },
    });
    if (target?.isCanonical && target.variants.length > 0) {
      productIds = [productId, ...target.variants.map((v) => v.id)];
    } else {
      productIds = [productId];
    }
  }

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      ...(inventoryId ? { inventoryId } : {}),
      ...(productIds
        ? { inventory: { productId: { in: productIds } } }
        : {}),
    },
    include: {
      inventory: {
        select: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(movements);
}
