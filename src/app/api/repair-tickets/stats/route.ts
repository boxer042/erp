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
    lostPartsCostTotal,
    lostPartsCostByMonth,
    lostPartsCostByProduct,
    avgDaysByCategory,
    avgDaysByProduct,
    byCustomerType,
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
    // LOST 부속 — 회사 손실(billLost=false) 만 합산. 청구된(billLost=true) 분은 매출이라 제외.
    prisma.$queryRaw<{ total_cost: string | null; count: bigint }[]>`
      SELECT
        SUM(rp.total_price)::text AS total_cost,
        COUNT(*)::bigint AS count
      FROM repair_parts rp
      JOIN repair_tickets rt ON rt.id = rp.repair_ticket_id
      WHERE rp.status = 'LOST' AND rp.bill_lost = false
      ${fromSql}
      ${toSql}
    `,
    // LOST 회사 손실 월별 — 추세 시각화용
    prisma.$queryRaw<{ month: string; cost: string | null; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', rt.received_at), 'YYYY-MM') AS month,
             SUM(rp.total_price)::text AS cost,
             COUNT(*)::bigint AS count
      FROM repair_parts rp
      JOIN repair_tickets rt ON rt.id = rp.repair_ticket_id
      WHERE rp.status = 'LOST' AND rp.bill_lost = false
      ${fromSql}
      ${toSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // 상품별 LOST 회사 손실 — billLost=false 분만
    prisma.$queryRaw<{ repair_product_id: string | null; lost_cost: string | null }[]>`
      SELECT rt.repair_product_id,
             SUM(rp.total_price)::text AS lost_cost
      FROM repair_parts rp
      JOIN repair_tickets rt ON rt.id = rp.repair_ticket_id
      WHERE rp.status = 'LOST' AND rp.bill_lost = false AND rt.repair_product_id IS NOT NULL
      ${fromSql}
      ${toSql}
      GROUP BY 1
    `,
    // 카테고리별 평균 처리 기간 + 완료 건수 — 어떤 카테고리가 빠르게/느리게 처리되는지
    prisma.$queryRaw<{ repair_category_id: string | null; avg_days: number | null; count: bigint }[]>`
      SELECT rt.repair_category_id,
             AVG(EXTRACT(EPOCH FROM (rt.picked_up_at - rt.received_at)) / 86400) AS avg_days,
             COUNT(*)::bigint AS count
      FROM repair_tickets rt
      WHERE rt.status = 'PICKED_UP' AND rt.picked_up_at IS NOT NULL
      ${fromSql}
      ${toSql}
      GROUP BY 1
    `,
    // 상품별 평균 처리 기간 — byProduct 와 join 용
    prisma.$queryRaw<{ repair_product_id: string | null; avg_days: number | null }[]>`
      SELECT rt.repair_product_id,
             AVG(EXTRACT(EPOCH FROM (rt.picked_up_at - rt.received_at)) / 86400) AS avg_days
      FROM repair_tickets rt
      WHERE rt.status = 'PICKED_UP' AND rt.picked_up_at IS NOT NULL AND rt.repair_product_id IS NOT NULL
      ${fromSql}
      ${toSql}
      GROUP BY 1
    `,
    // 고객 type 별 수리 분포 — INDIVIDUAL / BUSINESS / UNREGISTERED
    prisma.$queryRaw<{ type: string; count: bigint; revenue: string | null }[]>`
      SELECT
        COALESCE(c.type::text, 'UNREGISTERED') AS type,
        COUNT(*)::bigint AS count,
        SUM(CASE WHEN rt.status = 'PICKED_UP' THEN rt.final_amount ELSE 0 END)::text AS revenue
      FROM repair_tickets rt
      LEFT JOIN customers c ON c.id = rt.customer_id
      WHERE 1=1 ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `,
  ]);

  // 상품별 LOST 손실 lookup
  const lostCostByProductId = new Map<string, number>();
  for (const r of lostPartsCostByProduct) {
    if (r.repair_product_id) {
      lostCostByProductId.set(
        r.repair_product_id,
        Number(r.lost_cost ?? 0),
      );
    }
  }
  // 카테고리/상품별 평균 처리 기간 lookup
  const avgDaysByCategoryId = new Map<string | null, { avgDays: number | null; count: number }>();
  for (const r of avgDaysByCategory) {
    avgDaysByCategoryId.set(r.repair_category_id, {
      avgDays: r.avg_days != null ? Number(r.avg_days) : null,
      count: Number(r.count),
    });
  }
  const avgDaysByProductId = new Map<string, number>();
  for (const r of avgDaysByProduct) {
    if (r.repair_product_id && r.avg_days != null) {
      avgDaysByProductId.set(r.repair_product_id, Number(r.avg_days));
    }
  }

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
    byCategory: byCategory.map((g) => {
      const avg = avgDaysByCategoryId.get(g.repairCategoryId);
      return {
        categoryId: g.repairCategoryId,
        categoryName: g.repairCategoryId
          ? (categoryName.get(g.repairCategoryId) ?? "삭제된 카테고리")
          : "기타",
        count: g._count,
        avgDays: avg?.avgDays ?? null,
        completedCount: avg?.count ?? 0,
      };
    }),
    byProduct: byProduct
      .map((g) => {
        const p = g.repairProductId ? productLookup.get(g.repairProductId) : null;
        const failures = g.repairProductId
          ? (failureCount.get(g.repairProductId) ?? 0)
          : 0;
        const lostCost = g.repairProductId
          ? (lostCostByProductId.get(g.repairProductId) ?? 0)
          : 0;
        const avgDays = g.repairProductId
          ? (avgDaysByProductId.get(g.repairProductId) ?? null)
          : null;
        return {
          productId: g.repairProductId,
          productName: p?.name ?? "(상품 정보 없음)",
          sku: p?.sku ?? "",
          count: g._count,
          failures,
          failureRate: g._count > 0 ? (failures / g._count) * 100 : 0,
          lostCost,
          avgDays,
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
    // LOST 부속 손실 — 수리 실패로 매장이 부담한 부속 비용
    lostParts: {
      totalCost: Number(lostPartsCostTotal[0]?.total_cost ?? 0),
      count: Number(lostPartsCostTotal[0]?.count ?? 0),
      byMonth: lostPartsCostByMonth.map((r) => ({
        month: r.month,
        cost: Number(r.cost ?? 0),
        count: Number(r.count),
      })),
    },
    byCustomerType: byCustomerType.map((r) => ({
      type: r.type,
      count: Number(r.count),
      revenue: Number(r.revenue ?? 0),
    })),
  });
}
