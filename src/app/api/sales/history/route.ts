import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import type { OrderPaymentMethod, Prisma } from "@prisma/client";

/**
 * 통합 판매내역 — 판매(Order) / 수리(RepairTicket PICKED_UP) / 임대(Rental RETURNED) UNION.
 *
 * Order 는 POS 결제 시 항상 생성되며 repairTicketId / rentalId 로 분류된다.
 * 직접 픽업(/api/repair-tickets/[id]/transition?action=pickup) 또는 직접 반납
 * (/api/rentals/[id]/return) 으로 처리된 케이스는 Order 가 없으므로 orphan
 * RepairTicket / Rental 도 함께 가져와 dedup 한다.
 *
 * Query params:
 *  - from, to       : YYYY-MM-DD (date 필터, 양쪽 inclusive)
 *  - type           : "product" | "repair" | "rental" (생략 시 전체)
 *  - paymentMethod  : OrderPaymentMethod
 *  - customerId     : 특정 고객만
 *  - search         : 번호/고객명/전화 부분일치
 *  - limit          : 기본 200, 최대 1000
 */

export type SalesHistoryRow = {
  id: string;
  type: "product" | "repair" | "rental";
  refNo: string;
  date: string; // ISO
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channelName: string | null;
  paymentMethod: OrderPaymentMethod | null;
  amount: number;
  status: string;
  /** 연결된 원천 — 판매:Order id, 수리:ticket id, 임대:rental id */
  sourceId: string;
  /** 수리·임대일 때 추가 식별자 */
  ticketNo?: string | null;
  rentalNo?: string | null;
};

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const type = searchParams.get("type") as
    | "product"
    | "repair"
    | "rental"
    | null;
  const paymentMethod = searchParams.get(
    "paymentMethod",
  ) as OrderPaymentMethod | null;
  const customerId = searchParams.get("customerId");
  const search = (searchParams.get("search") || "").trim();
  const sort = (searchParams.get("sort") || "date_desc") as
    | "date_desc"
    | "date_asc"
    | "amount_desc"
    | "amount_asc"
    | "type";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10) || 50),
  );
  // 내부 fetch 한도 (정렬 후 페이지네이션 적용 위해 큰 값) — CSV 는 별도 endpoint
  const FETCH_CAP = 5000;

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  // ── Order: 전체 (수리/임대 링크 포함) — 추후 type 필터 적용 ──────────
  const orderWhere: Prisma.OrderWhereInput = {
    status: { not: "CANCELLED" },
    ...(fromDate || toDate
      ? {
          orderDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(customerId ? { customerId } : {}),
    ...(search
      ? {
          OR: [
            { orderNo: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search } },
          ],
        }
      : {}),
  };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      paymentMethod: true,
      totalAmount: true,
      status: true,
      repairTicketId: true,
      rentalId: true,
      channel: { select: { name: true } },
      repairTicket: { select: { ticketNo: true } },
      rental: { select: { rentalNo: true } },
    },
    orderBy: { orderDate: "desc" },
    take: FETCH_CAP,
  });

  // 이미 Order 로 잡힌 ticket/rental id 들 — orphan 쿼리에서 제외
  const linkedTicketIds = new Set(
    orders.map((o) => o.repairTicketId).filter((v): v is string => !!v),
  );
  const linkedRentalIds = new Set(
    orders.map((o) => o.rentalId).filter((v): v is string => !!v),
  );

  // ── Orphan RepairTicket: PICKED_UP 인데 연결된 Order 없음 ─────────────
  const orphanTickets =
    type === "product" || type === "rental"
      ? []
      : await prisma.repairTicket.findMany({
          where: {
            status: "PICKED_UP",
            ...(linkedTicketIds.size
              ? { id: { notIn: Array.from(linkedTicketIds) } }
              : {}),
            ...(fromDate || toDate
              ? {
                  pickedUpAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
            ...(paymentMethod ? { paymentMethod } : {}),
            ...(customerId ? { customerId } : {}),
            ...(search
              ? {
                  OR: [
                    { ticketNo: { contains: search, mode: "insensitive" } },
                    {
                      customer: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { phone: { contains: search } },
                        ],
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            ticketNo: true,
            pickedUpAt: true,
            createdAt: true,
            customerId: true,
            paymentMethod: true,
            finalAmount: true,
            status: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { pickedUpAt: "desc" },
          take: FETCH_CAP,
        });

  // ── Orphan Rental: RETURNED 인데 연결된 Order 없음 ─────────────────────
  const orphanRentals =
    type === "product" || type === "repair"
      ? []
      : await prisma.rental.findMany({
          where: {
            status: "RETURNED",
            ...(linkedRentalIds.size
              ? { id: { notIn: Array.from(linkedRentalIds) } }
              : {}),
            ...(fromDate || toDate
              ? {
                  actualReturnedAt: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDate ? { lte: toDate } : {}),
                  },
                }
              : {}),
            ...(paymentMethod ? { paymentMethod } : {}),
            ...(customerId ? { customerId } : {}),
            ...(search
              ? {
                  OR: [
                    { rentalNo: { contains: search, mode: "insensitive" } },
                    {
                      customer: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { phone: { contains: search } },
                        ],
                      },
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            rentalNo: true,
            actualReturnedAt: true,
            createdAt: true,
            customerId: true,
            paymentMethod: true,
            finalAmount: true,
            status: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { actualReturnedAt: "desc" },
          take: FETCH_CAP,
        });

  // ── 정규화 ────────────────────────────────────────────────────────
  const orderRows: SalesHistoryRow[] = orders.map((o) => {
    const t: SalesHistoryRow["type"] = o.repairTicketId
      ? "repair"
      : o.rentalId
        ? "rental"
        : "product";
    return {
      id: `order-${o.id}`,
      type: t,
      refNo:
        t === "repair" && o.repairTicket
          ? o.repairTicket.ticketNo
          : t === "rental" && o.rental
            ? o.rental.rentalNo
            : o.orderNo,
      date: o.orderDate.toISOString(),
      customerId: o.customerId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      channelName: o.channel?.name ?? null,
      paymentMethod: o.paymentMethod,
      amount: Number(o.totalAmount),
      status: o.status,
      sourceId: o.id,
      ticketNo: o.repairTicket?.ticketNo ?? null,
      rentalNo: o.rental?.rentalNo ?? null,
    };
  });

  const orphanRepairRows: SalesHistoryRow[] = orphanTickets.map((t) => ({
    id: `repair-${t.id}`,
    type: "repair",
    refNo: t.ticketNo,
    date: (t.pickedUpAt ?? t.createdAt).toISOString(),
    customerId: t.customerId,
    customerName: t.customer?.name ?? null,
    customerPhone: t.customer?.phone ?? null,
    channelName: null,
    paymentMethod: t.paymentMethod,
    amount: Number(t.finalAmount),
    status: t.status,
    sourceId: t.id,
    ticketNo: t.ticketNo,
  }));

  const orphanRentalRows: SalesHistoryRow[] = orphanRentals.map((r) => ({
    id: `rental-${r.id}`,
    type: "rental",
    refNo: r.rentalNo,
    date: (r.actualReturnedAt ?? r.createdAt).toISOString(),
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    customerPhone: r.customer?.phone ?? null,
    channelName: null,
    paymentMethod: r.paymentMethod,
    amount: Number(r.finalAmount),
    status: r.status,
    sourceId: r.id,
    rentalNo: r.rentalNo,
  }));

  // type 필터 — Order 분류 후
  const filteredOrders = type
    ? orderRows.filter((r) => r.type === type)
    : orderRows;

  const all = [...filteredOrders, ...orphanRepairRows, ...orphanRentalRows];

  // 정렬
  const TYPE_ORDER: Record<string, number> = { product: 0, repair: 1, rental: 2 };
  all.sort((a, b) => {
    if (sort === "date_asc") {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    }
    if (sort === "amount_desc") {
      return b.amount - a.amount;
    }
    if (sort === "amount_asc") {
      return a.amount - b.amount;
    }
    if (sort === "type") {
      const t = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      if (t !== 0) return t;
      return a.date < b.date ? 1 : -1;
    }
    // date_desc (default)
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = (page - 1) * pageSize;
  const rows = all.slice(start, start + pageSize);

  // 요약 — 필터 적용 결과 전체 (페이지네이션 전)
  const summary = {
    totalCount,
    totalAmount: all.reduce((s, r) => s + r.amount, 0),
    byType: {
      product: all.filter((r) => r.type === "product").reduce(
        (s, r) => ({ count: s.count + 1, amount: s.amount + r.amount }),
        { count: 0, amount: 0 },
      ),
      repair: all.filter((r) => r.type === "repair").reduce(
        (s, r) => ({ count: s.count + 1, amount: s.amount + r.amount }),
        { count: 0, amount: 0 },
      ),
      rental: all.filter((r) => r.type === "rental").reduce(
        (s, r) => ({ count: s.count + 1, amount: s.amount + r.amount }),
        { count: 0, amount: 0 },
      ),
    },
    truncated: totalCount >= FETCH_CAP,
  };

  const pagination = {
    page,
    pageSize,
    totalPages,
    totalCount,
  };

  return NextResponse.json({ rows, summary, pagination });
}
