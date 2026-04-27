import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  const inventoryId = searchParams.get("inventoryId");

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      ...(inventoryId ? { inventoryId } : {}),
      ...(productId
        ? { inventory: { productId } }
        : {}),
    },
    include: {
      inventory: {
        select: { product: { select: { name: true, sku: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(movements);
}
