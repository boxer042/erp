import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 수리 통계 — 전체 ticket 기준 (CANCELLED/PICKED_UP 모두 포함, hard delete 제외).
 *
 * Query:
 *  - from / to (ISO date) — 기간 필터 (receivedAt 기준)
 *
 * 응답:
 *  - total / active / completed / cancelled
 *  - byStatus / byCancelReason / byCategory
 *  - soldAsProductByMonth (raw SQL — 기간 내 월별 그룹)
 *  - byProduct (top 20) — 상품별 수리 빈도 + 실패율 (SHOP_GAVE_UP / PARTS_UNAVAILABLE 비율)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from"); // "yyyy-MM-dd"
  const to = searchParams.get("to");
  // 상품 ranking 전용 카테고리 필터 — 다른 통계는 전체 유지 (해당 카테고리 외 비교 의미 없음)
  // "" = 전체, "__none__" = 카테고리 없는 (기타) 상품만
  const productRankingCategoryId = searchParams.get("productRankingCategoryId");

  const dateFilter: Prisma.RepairTicketWhereInput = {};
  if (from || to) {
    dateFilter.receivedAt = {};
    if (from) (dateFilter.receivedAt as { gte?: Date }).gte = new Date(`${from}T00:00:00`);
    if (to) (dateFilter.receivedAt as { lte?: Date }).lte = new Date(`${to}T23:59:59`);
  }

  // byProduct 전용 추가 필터 — repairCategoryId 기준
  const productCategoryFilter: Prisma.RepairTicketWhereInput = {};
  if (productRankingCategoryId === "__none__") {
    productCategoryFilter.repairCategoryId = null;
  } else if (productRankingCategoryId) {
    productCategoryFilter.repairCategoryId = productRankingCategoryId;
  }

  // 기간 SQL 조건 (raw query 용)
  const fromSql = from ? Prisma.sql`AND received_at >= ${new Date(`${from}T00:00:00`)}` : Prisma.empty;
  const toSql = to ? Prisma.sql`AND received_at <= ${new Date(`${to}T23:59:59`)}` : Prisma.empty;

  const [
    total,
    byStatus,
    byCancelReason,
    byCategory,
    byProduct,
    avgRepairDays,
    revenueByMonth,
    byAssignee,
    soldAsProductByMonth,
  ] = await Promise.all([
    prisma.repairTicket.count({ where: dateFilter }),
    prisma.repairTicket.groupBy({
      by: ["status"],
      where: dateFilter,
      _count: true,
    }),
    prisma.repairTicket.groupBy({
      by: ["cancelReason"],
      where: { ...dateFilter, status: "CANCELLED", cancelReason: { not: null } },
      _count: true,
    }),
    prisma.repairTicket.groupBy({
      by: ["repairCategoryId"],
      where: dateFilter,
      _count: true,
    }),
    // 상품별 수리 빈도 — repairProductId 기준 (시리얼/자유입력은 제외) + 카테고리 필터
    prisma.repairTicket.groupBy({
      by: ["repairProductId"],
      where: {
        ...dateFilter,
        ...productCategoryFilter,
        repairProductId: { not: null },
      },
      _count: true,
      orderBy: { _count: { repairProductId: "desc" } },
      take: 20,
    }),
    // 평균 수리 기간 (PICKED_UP 만 — 완료된 ticket 의 receivedAt → pickedUpAt 평균 일수)
    prisma.$queryRaw<{ avg_days: number | null; count: bigint }[]>`
      SELECT
        AVG(EXTRACT(EPOCH FROM (picked_up_at - received_at)) / 86400) AS avg_days,
        COUNT(*)::bigint AS count
      FROM repair_tickets
      WHERE status = 'PICKED_UP' AND picked_up_at IS NOT NULL
      ${fromSql}
      ${toSql}
    `,
    // 월별 수리 매출 (PICKED_UP, finalAmount 기준) — 기간 내
    prisma.$queryRaw<{ month: string; revenue: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', picked_up_at), 'YYYY-MM') AS month,
             SUM(final_amount)::text AS revenue,
             COUNT(*)::bigint AS count
      FROM repair_tickets
      WHERE status = 'PICKED_UP' AND picked_up_at IS NOT NULL
      ${fromSql}
      ${toSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // 담당자별 처리 건수 + 평균 기간 (PICKED_UP) — 어떤 직원이 많이/빨리 처리하는지
    prisma.$queryRaw<{ assignee_id: string | null; count: bigint; avg_days: number | null }[]>`
      SELECT
        assigned_to_id AS assignee_id,
        COUNT(*)::bigint AS count,
        AVG(EXTRACT(EPOCH FROM (picked_up_at - received_at)) / 86400) AS avg_days
      FROM repair_tickets
      WHERE status = 'PICKED_UP' AND picked_up_at IS NOT NULL AND assigned_to_id IS NOT NULL
      ${fromSql}
      ${toSql}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,
    // SOLD_AS_PRODUCT 월별 — 기간 무관 최근 12개월 (시계열 분석)
    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', cancelled_at), 'YYYY-MM') AS month,
             COUNT(*)::bigint AS count
      FROM repair_tickets
      WHERE cancel_reason = 'SOLD_AS_PRODUCT' AND cancelled_at IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT 12
    `,
  ]);

  // 담당자 이름 lookup
  const assigneeIds = byAssignee
    .map((g) => g.assignee_id)
    .filter((v): v is string => !!v);
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];
  const assigneeName = new Map(assignees.map((u) => [u.id, u.name]));

  // 카테고리 이름 lookup
  const categoryIds = byCategory
    .map((g) => g.repairCategoryId)
    .filter((v): v is string => !!v);
  const categories = categoryIds.length
    ? await prisma.productCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      })
    : [];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // 상품 이름 + 실패율 (SHOP_GAVE_UP / PARTS_UNAVAILABLE) 추가 lookup
  const productIds = byProduct
    .map((g) => g.repairProductId)
    .filter((v): v is string => !!v);
  const [products, failuresByProduct] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [],
    productIds.length
      ? prisma.repairTicket.groupBy({
          by: ["repairProductId"],
          where: {
            ...dateFilter,
            ...productCategoryFilter,
            repairProductId: { in: productIds },
            cancelReason: { in: ["SHOP_GAVE_UP", "PARTS_UNAVAILABLE"] },
          },
          _count: true,
        })
      : [],
  ]);
  const productLookup = new Map(products.map((p) => [p.id, p]));
  const failureCount = new Map<string, number>();
  for (const g of failuresByProduct) {
    if (g.repairProductId) failureCount.set(g.repairProductId, g._count);
  }

  const completed =
    byStatus.find((g) => g.status === "PICKED_UP")?._count ?? 0;
  const cancelled =
    byStatus.find((g) => g.status === "CANCELLED")?._count ?? 0;
  const active = total - completed - cancelled;

  return NextResponse.json({
    total,
    active,
    completed,
    cancelled,
    byStatus: byStatus.map((g) => ({ status: g.status, count: g._count })),
    byCancelReason: byCancelReason.map((g) => ({
      reason: g.cancelReason,
      count: g._count,
    })),
    byCategory: byCategory.map((g) => ({
      categoryId: g.repairCategoryId,
      categoryName: g.repairCategoryId
        ? (categoryName.get(g.repairCategoryId) ?? "삭제된 카테고리")
        : "기타",
      count: g._count,
    })),
    byProduct: byProduct
      .map((g) => {
        const p = g.repairProductId ? productLookup.get(g.repairProductId) : null;
        const failures = g.repairProductId
          ? (failureCount.get(g.repairProductId) ?? 0)
          : 0;
        return {
          productId: g.repairProductId,
          productName: p?.name ?? "(상품 정보 없음)",
          sku: p?.sku ?? "",
          count: g._count,
          failures,
          failureRate: g._count > 0 ? (failures / g._count) * 100 : 0,
        };
      })
      .filter((p) => !!p.productId),
    avgRepairDays: avgRepairDays[0]
      ? {
          avgDays: avgRepairDays[0].avg_days
            ? Number(avgRepairDays[0].avg_days)
            : null,
          completedCount: Number(avgRepairDays[0].count),
        }
      : { avgDays: null, completedCount: 0 },
    revenueByMonth: revenueByMonth.map((r) => ({
      month: r.month,
      revenue: r.revenue ?? "0",
      count: Number(r.count),
    })),
    byAssignee: byAssignee.map((g) => ({
      assigneeId: g.assignee_id,
      assigneeName: g.assignee_id
        ? (assigneeName.get(g.assignee_id) ?? "삭제된 사용자")
        : "(미지정)",
      count: Number(g.count),
      avgDays: g.avg_days ? Number(g.avg_days) : null,
    })),
    soldAsProductByMonth: soldAsProductByMonth.map((r) => ({
      month: r.month,
      count: Number(r.count),
    })),
  });
}
