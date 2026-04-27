import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const productId = searchParams.get("productId");
  const supplierProductId = searchParams.get("supplierProductId");
  const mapped = searchParams.get("mapped") ?? "all";
  const source = searchParams.get("source");
  const hasRemaining = searchParams.get("hasRemaining") === "true";

  const where: Prisma.InventoryLotWhereInput = {};

  if (supplierProductId) {
    where.supplierProductId = supplierProductId;
  }
  if (supplierId) {
    where.supplierProduct = { supplierId };
  }
  if (productId) {
    where.productId = productId;
  }
  if (mapped === "mapped") {
    where.productId = productId ?? { not: null };
  } else if (mapped === "orphan") {
    where.productId = null;
  }
  if (source && ["INCOMING", "INITIAL", "ADJUSTMENT"].includes(source)) {
    where.source = source as Prisma.InventoryLotWhereInput["source"];
  }
  if (hasRemaining) {
    where.remainingQty = { gt: 0 };
  }

  const lots = await prisma.inventoryLot.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      supplierProduct: {
        select: {
          id: true,
          name: true,
          supplierCode: true,
          spec: true,
          unitOfMeasure: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
  });

  return NextResponse.json(lots);
}
