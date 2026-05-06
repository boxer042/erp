import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 매출 대시보드 통계 — Order 기반.
 *
 * Query: from / to (orderDate 기준)
 *
 * 응답:
 *  - kpi: 총 매출 / 평균 객단가 / 주문 건수
 *  - byChannel: 채널별 매출 + 건수
 *  - byPayment: 결제수단별 (카드/현금/계좌이체/외상)
 *  - byHour: 시간대별 매출 (0~23 시)
 *  - byWeekday: 요일별 매출 (1=월 ~ 7=일)
 *  - byMonth: 월별 매출 (최근 12개월 또는 기간 내)
 *  - topProducts: top 20 매출 상품
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromSql = from
    ? Prisma.sql`AND order_date >= ${new Date(`${from}T00:00:00`)}`
    : Prisma.empty;
  const toSql = to
    ? Prisma.sql`AND order_date <= ${new Date(`${to}T23:59:59`)}`
    : Prisma.empty;

  // 캔슬되지 않은 주문만 매출에 포함
  const statusFilter = Prisma.sql`AND status != 'CANCELLED'`;

  const [
    totals,
    byChannel,
    byPayment,
    byHour,
    byWeekday,
    byMonth,
    topProducts,
    byCustomerType,
    topBusinessCustomers,
  ] = await Promise.all([
    prisma.$queryRaw<{ count: bigint; total: string | null }[]>`
      SELECT COUNT(*)::bigint AS count,
             SUM(total_amount)::text AS total
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
    `,
    prisma.$queryRaw<{
      channel_id: string;
      total: string;
      commission: string;
      count: bigint;
    }[]>`
      SELECT channel_id,
             SUM(total_amount)::text AS total,
             SUM(commission_amount)::text AS commission,
             COUNT(*)::bigint AS count
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY channel_id
      ORDER BY SUM(total_amount) DESC
    `,
    prisma.$queryRaw<{ payment_method: string | null; total: string; count: bigint }[]>`
      SELECT payment_method, SUM(total_amount)::text AS total, COUNT(*)::bigint AS count
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY payment_method
    `,
    prisma.$queryRaw<{ hour: number; total: string; count: bigint }[]>`
      SELECT EXTRACT(HOUR FROM order_date)::int AS hour,
             SUM(total_amount)::text AS total,
             COUNT(*)::bigint AS count
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // PostgreSQL EXTRACT(DOW): 0=Sun ~ 6=Sat. ISODOW: 1=Mon ~ 7=Sun (운영 친화)
    prisma.$queryRaw<{ weekday: number; total: string; count: bigint }[]>`
      SELECT EXTRACT(ISODOW FROM order_date)::int AS weekday,
             SUM(total_amount)::text AS total,
             COUNT(*)::bigint AS count
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<{ month: string; total: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS month,
             SUM(total_amount)::text AS total,
             COUNT(*)::bigint AS count
      FROM orders
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // 상품별 매출 top 20 — OrderItem 기준
    prisma.$queryRaw<{
      product_id: string | null;
      revenue: string;
      qty: string;
      orders: bigint;
    }[]>`
      SELECT oi.product_id,
             SUM(oi.total_price)::text AS revenue,
             SUM(oi.quantity)::text AS qty,
             COUNT(DISTINCT oi.order_id)::bigint AS orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id IS NOT NULL ${statusFilter} ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY SUM(oi.total_price) DESC
      LIMIT 20
    `,
    // 고객 type 별 매출 — INDIVIDUAL/BUSINESS/UNREGISTERED 분류
    prisma.$queryRaw<{ type: string; total: string; count: bigint }[]>`
      SELECT
        COALESCE(c.type::text, 'UNREGISTERED') AS type,
        SUM(o.total_amount)::text AS total,
        COUNT(*)::bigint AS count
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE 1=1 ${statusFilter} ${fromSql} ${toSql}
      GROUP BY 1
      ORDER BY SUM(o.total_amount) DESC
    `,
    // 기업 고객 매출 top 10
    prisma.$queryRaw<{
      customer_id: string;
      name: string;
      business_number: string | null;
      total: string;
      count: bigint;
    }[]>`
      SELECT
        c.id AS customer_id,
        c.name,
        c.business_number,
        SUM(o.total_amount)::text AS total,
        COUNT(*)::bigint AS count
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE c.type = 'BUSINESS' ${statusFilter} ${fromSql} ${toSql}
      GROUP BY c.id, c.name, c.business_number
      ORDER BY SUM(o.total_amount) DESC
      LIMIT 10
    `,
  ]);

  // 채널 이름 lookup
  const channelIds = byChannel.map((g) => g.channel_id);
  const channels = channelIds.length
    ? await prisma.salesChannel.findMany({
        where: { id: { in: channelIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const channelById = new Map(channels.map((c) => [c.id, c]));

  // 상품 이름 lookup
  const productIds = topProducts
    .map((p) => p.product_id)
    .filter((v): v is string => !!v);
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const total = Number(totals[0]?.total ?? 0);
  const count = Number(totals[0]?.count ?? 0);

  return NextResponse.json({
    kpi: {
      total,
      count,
      avgOrderValue: count > 0 ? total / count : 0,
    },
    byChannel: byChannel.map((g) => ({
      channelId: g.channel_id,
      channelName: channelById.get(g.channel_id)?.name ?? "(삭제됨)",
      channelCode: channelById.get(g.channel_id)?.code ?? "",
      total: Number(g.total),
      commission: Number(g.commission ?? 0),
      net: Number(g.total) - Number(g.commission ?? 0),
      count: Number(g.count),
    })),
    byPayment: byPayment.map((g) => ({
      paymentMethod: g.payment_method,
      total: Number(g.total),
      count: Number(g.count),
    })),
    // 0-23 시 모든 슬롯 보장 (없는 시간대는 0)
    byHour: Array.from({ length: 24 }, (_, h) => {
      const r = byHour.find((x) => x.hour === h);
      return {
        hour: h,
        total: r ? Number(r.total) : 0,
        count: r ? Number(r.count) : 0,
      };
    }),
    // 1=월 ~ 7=일 모든 슬롯 보장
    byWeekday: Array.from({ length: 7 }, (_, i) => {
      const dow = i + 1;
      const r = byWeekday.find((x) => x.weekday === dow);
      return {
        weekday: dow,
        total: r ? Number(r.total) : 0,
        count: r ? Number(r.count) : 0,
      };
    }),
    byMonth: byMonth.map((g) => ({
      month: g.month,
      total: Number(g.total),
      count: Number(g.count),
    })),
    topProducts: topProducts.map((g) => {
      const p = g.product_id ? productById.get(g.product_id) : null;
      return {
        productId: g.product_id,
        productName: p?.name ?? "(상품 정보 없음)",
        sku: p?.sku ?? "",
        revenue: Number(g.revenue),
        qty: Number(g.qty),
        orders: Number(g.orders),
      };
    }),
    byCustomerType: byCustomerType.map((g) => ({
      type: g.type,
      total: Number(g.total),
      count: Number(g.count),
    })),
    topBusinessCustomers: topBusinessCustomers.map((g) => ({
      customerId: g.customer_id,
      name: g.name,
      businessNumber: g.business_number,
      total: Number(g.total),
      count: Number(g.count),
    })),
  });
}
