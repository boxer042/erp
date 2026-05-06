import { NextRequest } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import type { OrderPaymentMethod, Prisma } from "@prisma/client";

const TYPE_LABEL: Record<string, string> = {
  product: "판매",
  repair: "수리",
  rental: "임대",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 통합 판매내역 CSV — /api/sales/history 와 동일한 필터.
 * 정규화된 한 행을 그대로 한 row 로 직렬화.
 */
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

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  // ── Order ──
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
    take: 10000,
  });

  const linkedTicketIds = new Set(
    orders.map((o) => o.repairTicketId).filter((v): v is string => !!v),
  );
  const linkedRentalIds = new Set(
    orders.map((o) => o.rentalId).filter((v): v is string => !!v),
  );

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
            paymentMethod: true,
            finalAmount: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { pickedUpAt: "desc" },
          take: 10000,
        });

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
            paymentMethod: true,
            finalAmount: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { actualReturnedAt: "desc" },
          take: 10000,
        });

  // ── 정규화 ──
  type Row = {
    type: string;
    refNo: string;
    date: Date;
    customerName: string | null;
    customerPhone: string | null;
    channelName: string | null;
    paymentMethod: OrderPaymentMethod | null;
    amount: number;
    status: string;
  };

  const orderRows: Row[] = orders.map((o) => ({
    type: o.repairTicketId
      ? "repair"
      : o.rentalId
        ? "rental"
        : "product",
    refNo:
      o.repairTicket?.ticketNo ??
      o.rental?.rentalNo ??
      o.orderNo,
    date: o.orderDate,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    channelName: o.channel?.name ?? null,
    paymentMethod: o.paymentMethod,
    amount: Number(o.totalAmount),
    status: o.status,
  }));

  const orphanRepairRows: Row[] = orphanTickets.map((t) => ({
    type: "repair",
    refNo: t.ticketNo,
    date: t.pickedUpAt ?? t.createdAt,
    customerName: t.customer?.name ?? null,
    customerPhone: t.customer?.phone ?? null,
    channelName: null,
    paymentMethod: t.paymentMethod,
    amount: Number(t.finalAmount),
    status: "PICKED_UP",
  }));

  const orphanRentalRows: Row[] = orphanRentals.map((r) => ({
    type: "rental",
    refNo: r.rentalNo,
    date: r.actualReturnedAt ?? r.createdAt,
    customerName: r.customer?.name ?? null,
    customerPhone: r.customer?.phone ?? null,
    channelName: null,
    paymentMethod: r.paymentMethod,
    amount: Number(r.finalAmount),
    status: "RETURNED",
  }));

  const filteredOrders = type
    ? orderRows.filter((r) => r.type === type)
    : orderRows;

  const all = [...filteredOrders, ...orphanRepairRows, ...orphanRentalRows];
  all.sort((a, b) => b.date.getTime() - a.date.getTime());

  const lines: string[] = [];
  lines.push(
    [
      "타입",
      "번호",
      "일시",
      "채널",
      "고객",
      "전화",
      "결제수단",
      "상태",
      "금액",
    ]
      .map(csvEscape)
      .join(","),
  );

  for (const r of all) {
    lines.push(
      [
        TYPE_LABEL[r.type] ?? r.type,
        r.refNo,
        format(r.date, "yyyy-MM-dd HH:mm"),
        r.channelName ?? "",
        r.customerName ?? "(미등록)",
        r.customerPhone ?? "",
        r.paymentMethod ? PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod : "",
        r.status,
        r.amount.toString(),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = "﻿" + lines.join("\n");
  const filename = `sales-history-${from ?? "all"}-${to ?? "all"}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
