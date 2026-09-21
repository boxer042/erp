import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 최근 사용 부속·공임 — 진단(원인) 기반 추천이 없을 때의 fallback.
 *
 * 진단을 아직 안 골랐거나 학습 데이터가 없는 초기에도 가로카드가 비지 않게 한다.
 * 최근 사용 이력에서 빈도순으로 집계 (카탈로그 부속만 — 자유부속은 일회성이라 제외).
 */
export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const since = new Date();
  since.setDate(since.getDate() - 180);

  const [partRows, laborRows] = await Promise.all([
    prisma.repairPart.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, status: "USED", createdAt: { gte: since } },
      _count: { productId: true },
      orderBy: { _count: { productId: "desc" } },
      take: 12,
    }),
    prisma.repairLabor.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since } },
      _count: { name: true },
      _max: { unitRate: true },
      orderBy: { _count: { name: "desc" } },
      take: 12,
    }),
  ]);

  const productIds = partRows.map((r) => r.productId).filter((id): id is string => !!id);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, sku: true, sellingPrice: true },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  return NextResponse.json({
    parts: partRows
      .map((r) => {
        const p = r.productId ? byId.get(r.productId) : undefined;
        if (!p) return null;
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice.toString(),
          occurrenceCount: r._count.productId,
        };
      })
      .filter(Boolean),
    labors: laborRows.map((r) => ({
      name: r.name,
      unitRate: Number(r._max.unitRate ?? 0),
      occurrenceCount: r._count.name,
    })),
  });
}
