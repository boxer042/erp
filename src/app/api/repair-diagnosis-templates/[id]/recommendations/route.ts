import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 진단에 자주 매칭된 부속 + 공임 추천 + 세트 추천 — 진단 선택 후 수리 작업 시 자동 추가용.
 * GET /api/repair-diagnosis-templates/[id]/recommendations
 *   → {
 *       parts: [...]            // Phase 3 — 개별 부속 (각각 카운트)
 *       labors: [...]           // Phase 3 — 개별 공임
 *       sets: [...]             // Phase 4 — 부속·공임 묶음 (PICKED_UP 케이스에서 학습)
 *     }
 *
 * occurrenceCount desc 정렬, 상위 N개. 세트는 별도 LIMIT.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id: diagnosisId } = await params;
  const LIMIT = 8;
  const SET_LIMIT = 3;

  const [parts, labors, sets] = await Promise.all([
    prisma.diagnosisPartUsage.findMany({
      where: { diagnosisId },
      orderBy: { occurrenceCount: "desc" },
      take: LIMIT,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.diagnosisLaborUsage.findMany({
      where: { diagnosisId },
      orderBy: { occurrenceCount: "desc" },
      take: LIMIT,
    }),
    prisma.diagnosisPartSet.findMany({
      where: { diagnosisId },
      orderBy: { occurrenceCount: "desc" },
      take: SET_LIMIT,
    }),
  ]);

  // 세트의 productIds 를 Product 정보로 채워서 응답 (UI 가 한 번에 표시 가능)
  const allProductIds = Array.from(
    new Set(sets.flatMap((s) => s.productIds)),
  );
  const productMap = allProductIds.length
    ? new Map(
        (
          await prisma.product.findMany({
            where: { id: { in: allProductIds } },
            select: {
              id: true,
              name: true,
              sku: true,
              sellingPrice: true,
              isActive: true,
            },
          })
        ).map((p) => [p.id, p]),
      )
    : new Map();

  return NextResponse.json({
    parts: parts
      .filter((p) => p.product.isActive)
      .map((p) => ({
        productId: p.product.id,
        name: p.product.name,
        sku: p.product.sku,
        sellingPrice: p.product.sellingPrice.toString(),
        occurrenceCount: p.occurrenceCount,
      })),
    labors: labors.map((l) => ({
      name: l.laborName,
      unitRate: Number(l.unitRate),
      occurrenceCount: l.occurrenceCount,
    })),
    sets: sets
      .map((s) => ({
        id: s.id,
        occurrenceCount: s.occurrenceCount,
        parts: s.productIds
          .map((productId, i) => {
            const product = productMap.get(productId);
            if (!product || !product.isActive) return null;
            return {
              productId,
              name: product.name,
              sku: product.sku,
              sellingPrice: product.sellingPrice.toString(),
              avgQuantity: s.avgQuantities[i] ?? 1,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null),
        labors: s.laborNames.map((name, i) => ({
          name,
          unitRate: s.avgLaborRates[i] ?? 0,
        })),
      }))
      // 모든 부속이 inactive 가 되어 buyable item 이 하나도 없으면 세트 자체 제외
      .filter((s) => s.parts.length > 0 || s.labors.length > 0),
  });
}
