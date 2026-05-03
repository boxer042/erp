import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

/**
 * GET /api/serial-items
 * Query params:
 *   search   — 코드/상품명/고객이름 부분일치
 *   customerId
 *   productId
 *   limit (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const customerId = searchParams.get("customerId");
  const productId = searchParams.get("productId");
  const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "50", 10) || 50);

  const where: Prisma.SerialItemWhereInput = {};
  if (customerId) where.customerId = customerId;
  if (productId) where.productId = productId;
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { product: { name: { contains: search, mode: "insensitive" } } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const items = await prisma.serialItem.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, sku: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(items);
}
