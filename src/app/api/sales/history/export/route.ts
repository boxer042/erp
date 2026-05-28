import { NextRequest } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import type {
  OrderClaimReason,
  OrderClaimType,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  Prisma,
} from "@prisma/client";

const TYPE_LABEL: Record<string, string> = {
  product: "판매",
  repair: "수리",
  rebuild: "리빌드",
  rental: "임대",
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "혼합",
  UNPAID: "외상",
};

const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: "외상",
  PAID: "결제완료",
  PARTIAL_PAID: "부분결제",
  REFUND_PENDING: "환불진행",
  PARTIAL_REFUND: "부분환불",
  REFUNDED: "환불완료",
  SALES_CANCELLED: "매출취소",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "주문/접수",
  PREPARING: "출고대기",
  PREPARING_PACKED: "출고확정",
  SHIPPED: "배송중",
  COMPLETED: "배송완료",
  RETURN_REQUESTED: "반품요청",
  RETURN_ACCEPTED: "회수대기",
  RETURN_COLLECTED: "회수완료",
  RETURN_INSPECTED: "검수완료",
  RETURNED: "반품완료",
  EXCHANGED: "교환완료",
  CANCELLED: "취소",
  PICKED_UP: "수리완료(픽업)",
};

const CLAIM_TYPE_LABEL: Record<OrderClaimType, string> = {
  REFUND: "환불",
  EXCHANGE_SAME: "같은상품교환",
  EXCHANGE_DIFFERENT: "다른상품교환",
};

const CLAIM_REASON_LABEL: Record<OrderClaimReason, string> = {
  DEFECTIVE: "불량/하자",
  DAMAGED_IN_TRANSIT: "배송파손",
  WRONG_ITEM: "오배송",
  CHANGE_MIND: "단순변심",
  SIZE_COLOR: "사이즈/색상",
  OTHER: "기타",
};

const FULFILLMENT_LABEL: Record<string, string> = {
  PICKUP: "매장수령",
  DELIVERY: "배달",
  SHIPPING: "택배",
};

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const STATUS_GROUP_MAP: Record<string, OrderStatus[]> = {
  in_progress: ["PENDING", "PREPARING", "PREPARING_PACKED", "SHIPPED"],
  confirmed: ["COMPLETED"],
  claim: [
    "RETURN_REQUESTED",
    "RETURN_ACCEPTED",
    "RETURN_COLLECTED",
    "RETURN_INSPECTED",
  ],
  terminal: ["RETURNED", "EXCHANGED"],
};

/**
 * 통합 판매내역 CSV — /api/sales/history 와 동일한 필터를 적용.
 * 정규화된 한 행을 그대로 한 row 로 직렬화. 3축(출고/결제/클레임) 모두 포함.
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
  const paymentStatus = searchParams.get(
    "paymentStatus",
  ) as OrderPaymentStatus | null;
  const statusGroup = searchParams.get("statusGroup") ?? "all";
  const channelFilter = searchParams.get("channelFilter");
  const customerId = searchParams.get("customerId");
  const search = (searchParams.get("search") || "").trim();
  const includeExchangeReplacement =
    searchParams.get("includeExchangeReplacement") === "1";

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  const statusFilter: Prisma.OrderWhereInput =
    statusGroup === "all" || !STATUS_GROUP_MAP[statusGroup]
      ? { status: { not: "CANCELLED" } }
      : { status: { in: STATUS_GROUP_MAP[statusGroup] } };

  const channelWhere: Prisma.OrderWhereInput =
    channelFilter === "offline"
      ? { channelId: null }
      : channelFilter && channelFilter !== "all"
        ? { channelId: channelFilter }
        : {};

  const orderWhere: Prisma.OrderWhereInput = {
    ...statusFilter,
    ...channelWhere,
    ...(includeExchangeReplacement
      ? {}
      : { exchangedFromOrders: { none: {} } }),
    ...(fromDate || toDate
      ? {
          orderDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(customerId ? { customerId } : {}),
    ...(search
      ? {
          OR: [
            { orderNo: { contains: search, mode: "insensitive" } },
            { channelOrderNo: { contains: search, mode: "insensitive" } },
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
      channelOrderNo: true,
      orderDate: true,
      customerName: true,
      customerPhone: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      shippingFee: true,
      shippingCostBorne: true,
      status: true,
      claimType: true,
      claimReason: true,
      fulfillmentType: true,
      rentalId: true,
      channel: { select: { name: true } },
      repairTickets: {
        select: { id: true, ticketNo: true, workKind: true },
        orderBy: { receivedAt: "asc" },
      },
      rental: { select: { rentalNo: true } },
    },
    orderBy: { orderDate: "desc" },
    take: 10000,
  });

  const linkedTicketIds = new Set(
    orders.flatMap((o) => o.repairTickets.map((t) => t.id)),
  );
  const linkedRentalIds = new Set(
    orders.map((o) => o.rentalId).filter((v): v is string => !!v),
  );

  const orphanIncluded = !channelFilter || channelFilter === "all" || channelFilter === "offline";

  const orphanTickets =
    type === "product" || type === "rental" || !orphanIncluded
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
            workKind: true,
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
    type === "product" || type === "repair" || !orphanIncluded
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
    channelOrderNo: string | null;
    date: Date;
    customerName: string | null;
    customerPhone: string | null;
    channelName: string | null;
    paymentMethod: OrderPaymentMethod | null;
    paymentStatus: OrderPaymentStatus;
    status: string;
    claimType: OrderClaimType | null;
    claimReason: OrderClaimReason | null;
    fulfillmentType: string | null;
    amount: number;
    shippingFee: number;
    shippingCostBorne: number;
  };

  const orderRows: Row[] = orders.map((o) => {
    const firstTicket = o.repairTickets[0];
    return {
    type: firstTicket
      ? firstTicket.workKind === "CUSTOM_BUILD"
        ? "rebuild"
        : "repair"
      : o.rentalId
        ? "rental"
        : "product",
    refNo:
      o.repairTickets.length > 1
        ? `${firstTicket.ticketNo} 외 ${o.repairTickets.length - 1}건`
        : (firstTicket?.ticketNo ?? o.rental?.rentalNo ?? o.orderNo),
    channelOrderNo: o.channelOrderNo,
    date: o.orderDate,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    channelName: o.channel?.name ?? null,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    status: o.status,
    claimType: o.claimType,
    claimReason: o.claimReason,
    fulfillmentType: o.fulfillmentType,
    amount: Number(o.totalAmount),
    shippingFee: Number(o.shippingFee ?? 0),
    shippingCostBorne: Number(o.shippingCostBorne ?? 0),
    };
  });

  const orphanRepairRows: Row[] = orphanTickets.map((t) => ({
    type: t.workKind === "CUSTOM_BUILD" ? "rebuild" : "repair",
    refNo: t.ticketNo,
    channelOrderNo: null,
    date: t.pickedUpAt ?? t.createdAt,
    customerName: t.customer?.name ?? null,
    customerPhone: t.customer?.phone ?? null,
    channelName: null,
    paymentMethod: t.paymentMethod,
    paymentStatus:
      !t.paymentMethod || t.paymentMethod === "UNPAID" ? "UNPAID" : "PAID",
    status: "PICKED_UP",
    claimType: null,
    claimReason: null,
    fulfillmentType: null,
    amount: Number(t.finalAmount),
    shippingFee: 0,
    shippingCostBorne: 0,
  }));

  const orphanRentalRows: Row[] = orphanRentals.map((r) => ({
    type: "rental",
    refNo: r.rentalNo,
    channelOrderNo: null,
    date: r.actualReturnedAt ?? r.createdAt,
    customerName: r.customer?.name ?? null,
    customerPhone: r.customer?.phone ?? null,
    channelName: null,
    paymentMethod: r.paymentMethod,
    paymentStatus:
      !r.paymentMethod || r.paymentMethod === "UNPAID" ? "UNPAID" : "PAID",
    status: "RETURNED",
    claimType: null,
    claimReason: null,
    fulfillmentType: null,
    amount: Number(r.finalAmount),
    shippingFee: 0,
    shippingCostBorne: 0,
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
      "채널주문번호",
      "일시",
      "채널",
      "고객",
      "전화",
      "출고상태",
      "결제상태",
      "결제수단",
      "클레임유형",
      "클레임사유",
      "출고방식",
      "손님청구배송비",
      "매장부담배송원가",
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
        r.channelOrderNo ?? "",
        format(r.date, "yyyy-MM-dd HH:mm"),
        r.channelName ?? "",
        r.customerName ?? "(미등록)",
        r.customerPhone ?? "",
        STATUS_LABEL[r.status] ?? r.status,
        PAYMENT_STATUS_LABEL[r.paymentStatus] ?? r.paymentStatus,
        r.paymentMethod ? PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod : "",
        r.claimType ? CLAIM_TYPE_LABEL[r.claimType] : "",
        r.claimReason ? CLAIM_REASON_LABEL[r.claimReason] : "",
        r.fulfillmentType ? FULFILLMENT_LABEL[r.fulfillmentType] : "",
        r.shippingFee.toString(),
        r.shippingCostBorne.toString(),
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
