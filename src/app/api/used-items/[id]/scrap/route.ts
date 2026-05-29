import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { usedItemScrapSchema } from "@/lib/validators/used-item";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/used-items/[id]/scrap — 폐기 처리
 *
 * UsedItem.status = SCRAPPED + 누적 비용(acquiredCost + Σ addedCosts) 자동으로 Expense 생성.
 * 영업이익에 자연 반영. 연결된 시리얼이 있으면 status=SCRAPPED.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = usedItemScrapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.usedItem.findUnique({
    where: { id },
    include: {
      addedCosts: { select: { amount: true } },
      product: { select: { name: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "단품을 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.status !== "IN_STOCK") {
    return NextResponse.json(
      { error: "보관 중 상태가 아닌 단품은 폐기할 수 없습니다" },
      { status: 400 },
    );
  }

  // 누적 비용 = 매입가 + Σ 사후 비용
  const totalLoss =
    Number(existing.acquiredCost) +
    existing.addedCosts.reduce((sum, c) => sum + Number(c.amount), 0);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.usedItem.update({
        where: { id },
        data: { status: "SCRAPPED" },
      });

      // 연결 시리얼 SCRAPPED 처리
      if (existing.serialItemId) {
        await tx.serialItem.update({
          where: { id: existing.serialItemId },
          data: { status: "SCRAPPED" },
        });
      }

      // 손실이 있을 때만 Expense 생성 (무상 SCAVENGED 단품 + 비용 가산 0 이면 skip)
      if (totalLoss > 0) {
        await tx.expense.create({
          data: {
            date: new Date(),
            category: "INVENTORY_USAGE",
            description: `중고 단품 폐기 — ${existing.product?.name ?? existing.displayName} (${existing.internalCode}) · 사유: ${parsed.data.reason}`,
            amount: totalLoss,
            referenceType: "USED_ITEM",
            referenceId: id,
            createdById: user!.id,
          },
        });
      }
    });

    return NextResponse.json({ ok: true, totalLoss });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "폐기 처리에 실패했습니다";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
