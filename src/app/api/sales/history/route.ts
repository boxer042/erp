import { NextRequest, NextResponse } from "next/server";
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

/**
 * 통합 판매내역 — 판매(Order) / 수리(orphan RepairTicket PICKED_UP) / 임대(orphan Rental RETURNED) UNION.
 *
 * Order 는 POS 결제 시 항상 생성되며 repairTicketId / rentalId 로 분류된다.
 * 직접 픽업(/api/repair-tickets/[id]/transition?action=pickup) 또는 직접 반납으로
 * 처리된 케이스는 Order 가 없으므로 orphan RepairTicket / Rental 도 포함해 dedup.
 *
 * 주문 시스템 3축 모델 반영:
 *  - 출고(status), 결제(paymentStatus), 클레임(claimType + claimReason)
 *  - 교환 새 주문(-EX) 은 매출 중복 방지를 위해 기본 제외 (마진 리포트와 일관)
 */

export type SalesStatusGroup =
  | "all"
  | "in_progress" // PENDING~SHIPPED
  | "confirmed" // COMPLETED
  | "claim" // RETURN_REQUESTED~RETURN_INSPECTED
  | "terminal"; // RETURNED, EXCHANGED

const STATUS_GROUP_MAP: Record<Exclude<SalesStatusGroup, "all">, OrderStatus[]> =
  {
    in_progress: ["PENDING", "PREPARING", "PREPARING_PACKED", "SHIPPED"],
    confirmed: ["COMPLETED"],
    claim: [
      "RETURN_REQUESTED",
      "RETURN_ACCEPTED",
      "RETURN_PICKING",
      "RETURN_COLLECTED",
      "RETURN_INSPECTED",
    ],
    terminal: ["RETURNED", "EXCHANGED"],
  };

export type SalesHistoryRow = {
  id: string;
  type: "product" | "repair" | "rental";
  refNo: string;
  /** 외부 채널 주문번호 — Order 만 가짐 */
  channelOrderNo: string | null;
  date: string; // ISO
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  channelId: string | null;
  channelName: string | null;
  paymentMethod: OrderPaymentMethod | null;
  paymentStatus: OrderPaymentStatus;
  status: OrderStatus | "PICKED_UP" | "RETURNED";
  claimType: OrderClaimType | null;
  claimReason: OrderClaimReason | null;
  fulfillmentType:
    | "IN_STORE"
    | "PICKUP"
    | "DELIVERY"
    | "QUICK"
    | "SHIPPING"
    | null;
  /** 거래액 — VAT 포함 (고객 청구 총액). 표시용 */
  amount: number;
  /**
   * 순매출 기여분 — 공급가액(세전) 기준.
   * 환불/매출취소면 0, PARTIAL_REFUND 면 공급가액 − 부분환불액, 그 외엔 공급가액.
   */
  netAmount: number;
  /**
   * PARTIAL_REFUND 부분 환불 누적 금액 (세전). 0 이면 부분 환불 없음.
   * UI 의 strike + 차감 표시에 사용.
   */
  partialRefundAmount: number;
  /** 손님 청구 배송비 (세전, gross). Order 만. orphan 은 0. */
  shippingFee: number;
  /** 매장 부담 배송 원가 (세전, net). Order 만. orphan 은 0. */
  shippingCostBorne: number;
  /** 교환 새 주문 (-EX) 인지 — 마진 리포트는 항상 제외, 이 페이지는 토글로만 노출 */
  isExchangeReplacement: boolean;
  /**
   * 수리·임대 결제에 섞여 들어온 추가구매 라인 수 (productId 있는 OrderItem 수).
   * 0 이면 순수 수리/임대 결제. type=product 행은 항상 0.
   */
  extraSalesCount: number;
  /** 추가구매 라인 합계 (세전 totalPrice 합). 표시용 배지. */
  extraSalesAmount: number;
  /** 할인액 (VAT 포함) — 통합판매내역 행에 표시. 수리: RepairTicket.totalDiscount 합 × 1.1 */
  discountAmount: number;
  /** 수리 작업 성격 — REPAIR(일반) / CUSTOM_BUILD(리빌드). type=repair 일 때만 의미. */
  repairWorkKind: "REPAIR" | "CUSTOM_BUILD" | null;
  /** 연결된 원천 — 판매:Order id, 수리:ticket id (orphan), 임대:rental id (orphan) */
  sourceId: string;
  /** orphan 인지 — 클릭 시 라우팅 분기용 */
  isOrphan: boolean;
};

export type SalesHistorySummary = {
  totalCount: number;
  /** 표면 거래액 — 모든 행 amount 합 */
  totalAmount: number;
  /** 순매출 — 환불/매출취소 제외 */
  netAmount: number;
  /** 환불·취소 합 (REFUNDED + SALES_CANCELLED + RETURNED status) */
  refundedAmount: number;
  /** 미수 — paymentStatus=UNPAID 합 */
  unpaidAmount: number;
  /** 진행 중 클레임 건수 (RETURN_REQUESTED~RETURN_INSPECTED) */
  claimInProgressCount: number;
  byType: {
    product: { count: number; amount: number };
    repair: { count: number; amount: number };
    rental: { count: number; amount: number };
  };
  /** 채널별 매출 분포 — 순매출 기준, 내림차순 */
  byChannel: Array<{
    channelId: string | null;
    channelName: string;
    count: number;
    amount: number;
  }>;
  truncated: boolean;
};

const FETCH_CAP = 5000;

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
  const statusGroup =
    (searchParams.get("statusGroup") as SalesStatusGroup | null) ?? "all";
  const channelFilter = searchParams.get("channelFilter"); // "all" | "offline" | "<id>"
  const customerId = searchParams.get("customerId");
  const search = (searchParams.get("search") || "").trim();
  const includeExchangeReplacement =
    searchParams.get("includeExchangeReplacement") === "1";
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

  const fromDate = from ? new Date(`${from}T00:00:00`) : null;
  const toDate = to ? new Date(`${to}T23:59:59`) : null;

  // ── Order 필터 ─────────────────────────────────────────────
  const statusFilter: Prisma.OrderWhereInput =
    statusGroup === "all"
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
      customerId: true,
      customerName: true,
      customerPhone: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      subtotalAmount: true,
      shippingFee: true,
      shippingCostBorne: true,
      status: true,
      claimType: true,
      claimReason: true,
      fulfillmentType: true,
      rentalId: true,
      channelId: true,
      channel: { select: { id: true, name: true } },
      // N:1 — 한 Order 에 수리 여러 건. 첫 ticket 이 대표 표시용
      repairTickets: {
        select: {
          id: true,
          ticketNo: true,
          workKind: true,
          // 통합판매내역에서 행 아래 "할인 -₩X" 표시용 (VAT 포함으로 환산)
          totalDiscount: true,
        },
        orderBy: { receivedAt: "asc" },
      },
      rental: { select: { rentalNo: true } },
      exchangedFromOrders: { select: { id: true } },
      // PARTIAL_REFUND 매출 보정용 — 항목별 누적 환불 금액 (세전).
      // refundedAmount 합계가 totalAmount 와 같으면 사실상 전액 환불 → REFUNDED 와 동일 처리.
      // 수리/임대 결제에 추가구매 라인이 같이 들어간 경우 — productId 있는 라인 = 추가구매.
      items: {
        select: { refundedAmount: true, productId: true, totalPrice: true },
      },
    },
    orderBy: { orderDate: "desc" },
    take: FETCH_CAP,
  });

  // 이미 Order 로 잡힌 ticket/rental id — orphan 쿼리에서 제외
  const linkedTicketIds = new Set(
    orders.flatMap((o) => o.repairTickets.map((t) => t.id)),
  );
  const linkedRentalIds = new Set(
    orders.map((o) => o.rentalId).filter((v): v is string => !!v),
  );

  // orphan 은 채널 개념이 없으므로 channelFilter=offline/all 일 때만 포함
  const orphanIncluded = !channelFilter || channelFilter === "all" || channelFilter === "offline";

  // ── Orphan RepairTicket — PICKED_UP, Order 없음 ────────────
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
            customerId: true,
            paymentMethod: true,
            finalAmount: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { pickedUpAt: "desc" },
          take: FETCH_CAP,
        });

  // ── Orphan Rental — RETURNED, Order 없음 ───────────────────
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
            customerId: true,
            paymentMethod: true,
            finalAmount: true,
            customer: { select: { name: true, phone: true } },
          },
          orderBy: { actualReturnedAt: "desc" },
          take: FETCH_CAP,
        });

  // ── 정규화 ────────────────────────────────────────────────
  const orderRows: SalesHistoryRow[] = orders.map((o) => {
    const t: SalesHistoryRow["type"] = o.repairTickets.length > 0
      ? "repair"
      : o.rentalId
        ? "rental"
        : "product";
    // amount = VAT 포함 거래액 (고객 청구 총액, 표시용)
    // supplyAmount = 공급가액(세전) — 순매출(netAmount) 산정 기준
    const amount = Number(o.totalAmount);
    const supplyAmount = Number(o.subtotalAmount);
    // 누적 부분 환불 금액 (세전 공급가액 기준) — PARTIAL_REFUND 일 때 의미 있음
    const partialRefundAmount = (o.items ?? []).reduce(
      (s, it) => s + Number(it.refundedAmount ?? 0),
      0,
    );
    const isReversed =
      o.status === "RETURNED" ||
      o.paymentStatus === "REFUNDED" ||
      o.paymentStatus === "SALES_CANCELLED";
    // PARTIAL_REFUND — 부분 환불액(세전)만큼 공급가액에서 차감해 순매출 계산. 음수 가드.
    const isPartial = o.paymentStatus === "PARTIAL_REFUND";
    const partialNet = isPartial
      ? Math.max(0, supplyAmount - partialRefundAmount)
      : supplyAmount;
    // 수리·임대 결제에 섞여 들어온 추가구매 라인 — productId 있는 라인 = 추가구매 (수리 라인은 productId=null + serviceName).
    // 메인 type=product 에는 의미 없음 (전체가 product 라인).
    const extraItems =
      t === "repair" || t === "rental"
        ? (o.items ?? []).filter((it) => it.productId != null)
        : [];
    const extraSalesCount = extraItems.length;
    const extraSalesAmount = extraItems.reduce(
      (s, it) => s + Number(it.totalPrice ?? 0),
      0,
    );
    // 수리 라인 할인 합산 (VAT 포함) — 같은 Order 에 수리 N건이면 모두 합쳐서 표시.
    // RepairTicket.totalDiscount 는 NET 저장값이라 × 1.1 로 환산.
    const repairDiscountNet = o.repairTickets.reduce(
      (s, rt) => s + (parseInt((rt.totalDiscount ?? "0").replace(/,/g, ""), 10) || 0),
      0,
    );
    const discountAmountVatIncl = Math.round(repairDiscountNet * 1.1);

    return {
      id: `order-${o.id}`,
      type: t,
      refNo:
        t === "repair" && o.repairTickets.length > 0
          ? o.repairTickets.length === 1
            ? o.repairTickets[0].ticketNo
            : `${o.repairTickets[0].ticketNo} 외 ${o.repairTickets.length - 1}건`
          : t === "rental" && o.rental
            ? o.rental.rentalNo
            : o.orderNo,
      channelOrderNo: o.channelOrderNo,
      date: o.orderDate.toISOString(),
      customerId: o.customerId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      channelId: o.channelId,
      channelName: o.channel?.name ?? null,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      status: o.status,
      claimType: o.claimType,
      claimReason: o.claimReason,
      fulfillmentType: o.fulfillmentType,
      amount,
      netAmount: isReversed ? 0 : partialNet,
      partialRefundAmount: isPartial ? partialRefundAmount : 0,
      discountAmount: discountAmountVatIncl,
      shippingFee: Number(o.shippingFee ?? 0),
      shippingCostBorne: Number(o.shippingCostBorne ?? 0),
      isExchangeReplacement: (o.exchangedFromOrders?.length ?? 0) > 0,
      extraSalesCount,
      extraSalesAmount,
      repairWorkKind: o.repairTickets[0]?.workKind ?? null,
      sourceId: o.id,
      isOrphan: false,
    };
  });

  const orphanRepairRows: SalesHistoryRow[] = orphanTickets.map((t) => {
    const amount = Number(t.finalAmount);
    return {
      id: `repair-${t.id}`,
      type: "repair",
      refNo: t.ticketNo,
      channelOrderNo: null,
      date: (t.pickedUpAt ?? t.createdAt).toISOString(),
      customerId: t.customerId,
      customerName: t.customer?.name ?? null,
      customerPhone: t.customer?.phone ?? null,
      channelId: null,
      channelName: null,
      paymentMethod: t.paymentMethod,
      // orphan 은 paymentStatus 없음 — 결제수단으로 추정 (UNPAID/null → UNPAID, 그 외 → PAID)
      paymentStatus:
        !t.paymentMethod || t.paymentMethod === "UNPAID" ? "UNPAID" : "PAID",
      status: "PICKED_UP",
      claimType: null,
      claimReason: null,
      fulfillmentType: null,
      amount,
      netAmount: amount,
      partialRefundAmount: 0,
      shippingFee: 0,
      shippingCostBorne: 0,
      isExchangeReplacement: false,
      extraSalesCount: 0,
      extraSalesAmount: 0,
      discountAmount: 0,
      repairWorkKind: t.workKind,
      sourceId: t.id,
      isOrphan: true,
    };
  });

  const orphanRentalRows: SalesHistoryRow[] = orphanRentals.map((r) => {
    const amount = Number(r.finalAmount);
    return {
      id: `rental-${r.id}`,
      type: "rental",
      refNo: r.rentalNo,
      channelOrderNo: null,
      date: (r.actualReturnedAt ?? r.createdAt).toISOString(),
      customerId: r.customerId,
      customerName: r.customer?.name ?? null,
      customerPhone: r.customer?.phone ?? null,
      channelId: null,
      channelName: null,
      paymentMethod: r.paymentMethod,
      paymentStatus:
        !r.paymentMethod || r.paymentMethod === "UNPAID" ? "UNPAID" : "PAID",
      status: "RETURNED",
      claimType: null,
      claimReason: null,
      fulfillmentType: null,
      amount,
      netAmount: amount,
      partialRefundAmount: 0,
      shippingFee: 0,
      shippingCostBorne: 0,
      isExchangeReplacement: false,
      extraSalesCount: 0,
      extraSalesAmount: 0,
      discountAmount: 0,
      repairWorkKind: null,
      sourceId: r.id,
      isOrphan: true,
    };
  });

  // type 필터 — Order 분류 후
  const filteredOrders = type
    ? orderRows.filter((r) => r.type === type)
    : orderRows;

  const all = [...filteredOrders, ...orphanRepairRows, ...orphanRentalRows];

  // 정렬
  const TYPE_ORDER: Record<string, number> = {
    product: 0,
    repair: 1,
    rental: 2,
  };
  all.sort((a, b) => {
    if (sort === "date_asc") return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    if (sort === "amount_desc") return b.amount - a.amount;
    if (sort === "amount_asc") return a.amount - b.amount;
    if (sort === "type") {
      const t = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
      if (t !== 0) return t;
      return a.date < b.date ? 1 : -1;
    }
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });

  // 요약 — 페이지네이션 전 전체
  const claimInProgressStatuses = new Set<string>([
    "RETURN_REQUESTED",
    "RETURN_ACCEPTED",
    "RETURN_PICKING",
    "RETURN_COLLECTED",
    "RETURN_INSPECTED",
  ]);

  const channelMap = new Map<
    string,
    { channelId: string | null; channelName: string; count: number; amount: number }
  >();

  let totalAmount = 0;
  let netAmount = 0;
  let refundedAmount = 0;
  let unpaidAmount = 0;
  let claimInProgressCount = 0;
  const byTypeAcc = {
    product: { count: 0, amount: 0 },
    repair: { count: 0, amount: 0 },
    rental: { count: 0, amount: 0 },
  };

  for (const r of all) {
    totalAmount += r.amount;
    netAmount += r.netAmount;
    if (
      r.status === "RETURNED" ||
      r.paymentStatus === "REFUNDED" ||
      r.paymentStatus === "SALES_CANCELLED"
    ) {
      refundedAmount += r.amount;
    } else if (r.partialRefundAmount > 0) {
      // PARTIAL_REFUND — 부분 환불액만 환불 합계에 가산
      refundedAmount += r.partialRefundAmount;
    }
    if (r.paymentStatus === "UNPAID") unpaidAmount += r.amount;
    if (claimInProgressStatuses.has(r.status)) claimInProgressCount += 1;

    byTypeAcc[r.type].count += 1;
    byTypeAcc[r.type].amount += r.netAmount;

    const key = r.channelId ?? "__offline__";
    const label = r.channelName ?? "오프라인";
    const cur = channelMap.get(key) ?? {
      channelId: r.channelId,
      channelName: label,
      count: 0,
      amount: 0,
    };
    cur.count += 1;
    cur.amount += r.netAmount;
    channelMap.set(key, cur);
  }

  const byChannel = Array.from(channelMap.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  const summary: SalesHistorySummary = {
    totalCount: all.length,
    totalAmount,
    netAmount,
    refundedAmount,
    unpaidAmount,
    claimInProgressCount,
    byType: byTypeAcc,
    byChannel,
    truncated: all.length >= FETCH_CAP,
  };

  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  const start = (page - 1) * pageSize;
  const rows = all.slice(start, start + pageSize);

  return NextResponse.json({
    rows,
    summary,
    pagination: {
      page,
      pageSize,
      totalPages,
      totalCount: all.length,
    },
  });
}
