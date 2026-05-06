import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 자주 쓰는 상품 — 최근 N일 OrderItem 빈도 상위 limit 개.
 * POS v2 의 카테고리 "전체" 진입 시 상단에 표시.
 *
 * Query: ?days=30&limit=8
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10) || 30));
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "8", 10) || 8));

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 최근 N일 OrderItem 별 빈도 — productId 그룹
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { orderDate: { gte: since } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  const productIds = grouped
    .map((g) => g.productId)
    .filter((id): id is string => !!id);
  if (productIds.length === 0) return NextResponse.json([]);

  // 상품 정보 일괄 조회 (N+1 방지)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      spec: true,
      sellingPrice: true,
      listPrice: true,
      imageUrl: true,
      taxType: true,
      zeroRateEligible: true,
      isBulk: true,
      unitOfMeasure: true,
      isCanonical: true,
      autoMapped: true,
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // 빈도 순서 보존
  const ordered = grouped
    .map((g) => g.productId && byId.get(g.productId))
    .filter((p): p is NonNullable<typeof p> => !!p);

  return NextResponse.json(ordered);
}
