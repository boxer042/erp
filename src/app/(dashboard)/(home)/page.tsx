import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  Banknote,
  Container,
  FileText,
  Hourglass,
  Package,
  PackageOpen,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  UserPlus,
  Wifi,
  Wrench,
} from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  type JmBadgeProps,
} from "@/jm";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { QuickActionsBar } from "./_quick-actions";
import {
  ChannelDonut,
  DailySalesArea,
  MarginTrendLine,
  PaymentMixBars,
  type MarginTrendPoint,
} from "./_charts";
import {
  DASHBOARD_PERIODS,
  delta,
  fmt,
  fmtCompact,
  parseYmd,
  periodRange,
  type DashboardPeriod,
} from "./_helpers";
import { PeriodToggle } from "./_period-toggle";
import { CollapsibleKpiSection } from "./_kpi-collapse";
import { ClickableStat } from "./_clickable-stat";
import { RefreshButton } from "./_refresh-button";
import { CsvButton, type CsvData } from "./_csv-export";

type BadgeVariant = NonNullable<JmBadgeProps["variant"]>;

const statusBadge: Record<string, { label: string; variant: BadgeVariant }> = {
  PENDING: { label: "접수", variant: "warning" },
  PREPARING: { label: "출고대기", variant: "info" },
  PREPARING_PACKED: { label: "출고확정", variant: "info" },
  SHIPPED: { label: "배송중", variant: "info" },
  COMPLETED: { label: "완료", variant: "success" },
  RETURN_REQUESTED: { label: "반품요청", variant: "warning" },
  RETURN_ACCEPTED: { label: "반품수락", variant: "warning" },
  RETURN_PICKING: { label: "회수중", variant: "warning" },
  RETURN_COLLECTED: { label: "회수완료", variant: "warning" },
  RETURN_INSPECTED: { label: "검수완료", variant: "warning" },
  RETURNED: { label: "반품완료", variant: "danger" },
  EXCHANGED: { label: "교환완료", variant: "info" },
  CANCELLED: { label: "취소", variant: "danger" },
};

const SOLD_STATUSES = ["PREPARING", "PREPARING_PACKED", "SHIPPED", "COMPLETED"] as const;
const REVERSED_PAYMENT_STATUSES = ["REFUNDED", "SALES_CANCELLED"] as const;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  MIXED: "복합결제",
  UNPAID: "외상 (미수)",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  let period: DashboardPeriod = DASHBOARD_PERIODS.includes(
    params.period as DashboardPeriod,
  )
    ? (params.period as DashboardPeriod)
    : "this-month";

  let custom: { from: Date; to: Date } | undefined;
  if (period === "custom") {
    const f = params.from ? parseYmd(params.from) : null;
    const t = params.to ? parseYmd(params.to) : null;
    if (f && t && f <= t) {
      custom = { from: f, to: t };
    } else {
      // 잘못된 custom — this-month 로 폴백
      period = "this-month";
    }
  }

  const now = new Date();
  const range = periodRange(period, now, custom);
  // 시점 기반 (현재 시각 기준) — 오늘 현금흐름 / 데드스톡 / 데드 컷오프 / 30·90 일 등은 기간 토글 영향 없음
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const start7Days = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000);
  const days30Ago = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
  const days90Ago = new Date(startOfToday.getTime() - 90 * 24 * 60 * 60 * 1000);
  const deadstockCutoff = new Date(startOfToday.getTime() - 90 * 24 * 60 * 60 * 1000);
  const repairReadyCutoff = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 매출 정의 — /sales/history 의 netAmount 와 동기화:
  //   status IN [PREPARING..COMPLETED] · paymentStatus NOT IN [REFUNDED, SALES_CANCELLED] · -EX 제외
  //   그 후 PARTIAL_REFUND 차감은 OrderItem.refundedAmount 합으로 별도 보정.
  const soldOrderWhere = {
    status: { in: [...SOLD_STATUSES] },
    paymentStatus: { notIn: [...REVERSED_PAYMENT_STATUSES] },
    exchangedFromOrders: { none: {} },
  };

  const monthLabel = range.label;
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;

  const [
    // 매출
    monthlySalesAgg,
    lastMonthSalesAgg,
    monthlyChannelSales,
    soldOrderItems,
    lastMonthSoldItems,
    monthlyPartialRefundAgg,
    lastMonthPartialRefundAgg,
    monthlyOrderCount,
    monthlyExpenseAgg,
    last7DaysOrders,
    paymentMethodGroups,
    monthlyReturnedCount,
    rentalActiveAssetTotal,
    rentalActiveAssetRented,
    repurchaseGroups,
    customerLedgerOldest,
    // 주문 운영
    pendingOrders,
    recentOrders,
    claimsPending,
    refundPending,
    outboundFailed,
    pendingChannelOrders,
    // 재고
    lowStockItems,
    inventoryLots,
    deadstockLots,
    bestsellerGroups,
    // 거래처/고객
    unpaidSuppliers,
    unpaidCustomers,
    newCustomersCount,
    activeCustomersCount,
    vipGroups,
    pendingIncoming,
    // 수리/임대
    activeRepairs,
    repairReady,
    repairReadyOver7d,
    repairQuoted,
    recentPickedUps,
    activeRentals,
    overdueRentals,
    rentalReturnToday,
    // POS
    activePosSessions,
    parkedPosSessions,
    // 워크플로 대기
    quotationsSent,
    quotationsExpiringSoon,
    pendingPurchaseOrders,
    taxInvoicePending,
    // 오늘 현금흐름
    todayReceived,
    todayPaid,
    todayExpense,
    todayRefund,
    todayReceivedCount,
    todayPaidCount,
    todayExpenseCount,
    // 감사
    recentAudits,
    // 차트 추가 페치
    trendItems,
    categoryItems,
    // 효율 지표 — 수리 공임/부속 합, 재수리 비율
    repairLaborAgg,
    repairPartAgg,
    periodRepairCount,
    periodRerepairCount,
    // 시간대 히트맵 — 선택 기간 SOLD 주문 시각·금액
    heatmapOrders,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalAmount: true, commissionAmount: true },
      _count: true,
      where: { ...soldOrderWhere, orderDate: { gte: range.from } },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        ...soldOrderWhere,
        orderDate: { gte: range.prevFrom, lt: range.prevTo },
      },
    }),
    prisma.order
      .groupBy({
        by: ["channelId"],
        where: { ...soldOrderWhere, orderDate: { gte: range.from } },
        _sum: { totalAmount: true, commissionAmount: true },
        _count: true,
      })
      .then(async (groups) => {
        const channelIds = groups
          .map((g) => g.channelId)
          .filter((x): x is string => !!x);
        const channels = await prisma.salesChannel.findMany({
          where: { id: { in: channelIds } },
          select: { id: true, name: true },
        });
        return groups
          .map((g) => ({
            channelId: g.channelId ?? null,
            channelName: g.channelId
              ? channels.find((c) => c.id === g.channelId)?.name ??
                "(삭제된 채널)"
              : "오프라인",
            orderCount: g._count,
            totalAmount: Number(g._sum.totalAmount ?? 0),
            commissionAmount: Number(g._sum.commissionAmount ?? 0),
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount);
      }),
    prisma.orderItem.findMany({
      where: { order: { ...soldOrderWhere, orderDate: { gte: range.from } } },
      select: {
        quantity: true,
        unitCostSnapshot: true,
        unitPrice: true,
        lotConsumptions: { select: { quantity: true, unitCost: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          ...soldOrderWhere,
          orderDate: { gte: range.prevFrom, lt: range.prevTo },
        },
      },
      select: {
        quantity: true,
        unitCostSnapshot: true,
        unitPrice: true,
        lotConsumptions: { select: { quantity: true, unitCost: true } },
      },
    }),
    // PARTIAL_REFUND 차감용 — 이번 달 OrderItem.refundedAmount 합
    prisma.orderItem.aggregate({
      _sum: { refundedAmount: true },
      where: { order: { ...soldOrderWhere, orderDate: { gte: range.from } } },
    }),
    prisma.orderItem.aggregate({
      _sum: { refundedAmount: true },
      where: {
        order: {
          ...soldOrderWhere,
          orderDate: { gte: range.prevFrom, lt: range.prevTo },
        },
      },
    }),
    // 이번 달 주문 수 — AOV 분모 (별도 추출, 채널 그룹과 정합성)
    prisma.order.count({
      where: { ...soldOrderWhere, orderDate: { gte: range.from } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { date: { gte: range.from } },
    }),
    prisma.order.findMany({
      where: { ...soldOrderWhere, orderDate: { gte: start7Days, lt: endOfToday } },
      select: { orderDate: true, totalAmount: true },
    }),
    // 결제 수단 분포 — 이번 달 SOLD 주문, paymentMethod 기준 매출 합
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { ...soldOrderWhere, orderDate: { gte: range.from } },
      _sum: { totalAmount: true },
    }),
    // 반품률 분자 — 이번 달 RETURNED
    prisma.order.count({
      where: {
        status: "RETURNED",
        orderDate: { gte: range.from },
        exchangedFromOrders: { none: {} },
      },
    }),
    // 임대 가동률 — RETIRED 외 자산 / 그 중 RENTED
    prisma.rentalAsset.count({ where: { status: { not: "RETIRED" } } }),
    prisma.rentalAsset.count({ where: { status: "RENTED" } }),
    // 재구매율 — 지난 90일 동안 SOLD 한 고객 그룹 + 횟수
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        ...soldOrderWhere,
        customerId: { not: null },
        orderDate: { gte: days90Ago },
      },
      _count: true,
    }),
    // 미수금 30일+ 정밀 — 각 고객의 가장 오래된 SALE ledger 진입 시각
    prisma.customerLedger.groupBy({
      by: ["customerId"],
      where: { type: "SALE" },
      _min: { createdAt: true },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { channel: { select: { name: true } } },
    }),
    prisma.order.count({
      where: {
        status: { in: ["RETURN_REQUESTED", "RETURN_INSPECTED"] },
      },
    }),
    prisma.order.count({ where: { paymentStatus: "REFUND_PENDING" } }),
    prisma.channelOutboundJob.count({ where: { status: "FAILED" } }),
    prisma.pendingChannelOrder.count({ where: { resolvedAt: null } }),
    prisma.inventory
      .findMany({
        where: { safetyStock: { gt: 0 }, product: { isActive: true } },
        include: { product: { select: { name: true, sku: true } } },
      })
      .then((items) =>
        items.filter((i) => Number(i.quantity) <= Number(i.safetyStock)),
      ),
    prisma.inventoryLot.findMany({
      where: { remainingQty: { gt: 0 } },
      select: { remainingQty: true, unitCost: true },
    }),
    prisma.inventoryLot.findMany({
      where: {
        remainingQty: { gt: 0 },
        receivedAt: { lt: deadstockCutoff },
        productId: { not: null },
      },
      take: 5,
      orderBy: { receivedAt: "asc" },
      include: {
        product: { select: { name: true, sku: true } },
      },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        order: { ...soldOrderWhere, orderDate: { gte: range.from } },
      },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    prisma.supplierLedger
      .groupBy({
        by: ["supplierId"],
        _sum: { debitAmount: true, creditAmount: true },
      })
      .then(async (groups) => {
        const withBalance = groups
          .map((g) => ({
            supplierId: g.supplierId,
            balance:
              Number(g._sum.debitAmount ?? 0) -
              Number(g._sum.creditAmount ?? 0),
          }))
          .filter((g) => g.balance > 0)
          .sort((a, b) => b.balance - a.balance);
        if (withBalance.length === 0) return [];
        const suppliers = await prisma.supplier.findMany({
          where: { id: { in: withBalance.map((g) => g.supplierId) } },
          select: { id: true, name: true },
        });
        return withBalance.map((g) => ({
          ...g,
          name: suppliers.find((s) => s.id === g.supplierId)?.name ?? "",
        }));
      }),
    prisma.customerLedger
      .groupBy({
        by: ["customerId"],
        _sum: { debitAmount: true, creditAmount: true },
      })
      .then(async (groups) => {
        const withBalance = groups
          .map((g) => ({
            customerId: g.customerId,
            balance:
              Number(g._sum.debitAmount ?? 0) -
              Number(g._sum.creditAmount ?? 0),
          }))
          .filter((g) => g.balance > 0)
          .sort((a, b) => b.balance - a.balance);
        if (withBalance.length === 0) return [];
        const customers = await prisma.customer.findMany({
          where: { id: { in: withBalance.map((g) => g.customerId) } },
          select: { id: true, name: true },
        });
        return withBalance.map((g) => ({
          ...g,
          name: customers.find((c) => c.id === g.customerId)?.name ?? "",
        }));
      }),
    prisma.customer.count({ where: { createdAt: { gte: range.from } } }),
    // 활성 고객 — 지난 30일 내 _정상 매출_ 거래가 있는 고객. soldOrderWhere 와 동기 (취소·반품·매출취소 제외)
    prisma.customer.count({
      where: {
        orders: {
          some: { ...soldOrderWhere, orderDate: { gte: days30Ago } },
        },
      },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        ...soldOrderWhere,
        customerId: { not: null },
        orderDate: { gte: range.from },
      },
      _sum: { totalAmount: true },
      _count: true,
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
    prisma.incoming.count({ where: { status: "PENDING" } }),
    prisma.repairTicket.count({
      where: { status: { notIn: ["PICKED_UP", "CANCELLED", "READY"] } },
    }),
    prisma.repairTicket.count({ where: { status: "READY" } }),
    prisma.repairTicket.count({
      where: { status: "READY", updatedAt: { lt: repairReadyCutoff } },
    }),
    prisma.repairTicket.count({ where: { status: "QUOTED" } }),
    prisma.repairTicket.findMany({
      where: { status: "PICKED_UP", pickedUpAt: { not: null } },
      orderBy: { pickedUpAt: "desc" },
      take: 20,
      select: { receivedAt: true, pickedUpAt: true },
    }),
    prisma.rental.count({ where: { status: "ACTIVE" } }),
    prisma.rental.count({ where: { status: "OVERDUE" } }),
    prisma.rental.count({
      where: {
        status: { in: ["ACTIVE", "RESERVED"] },
        endDate: { gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.posSession.count({
      where: { deletedAt: null, parkedAt: null, customerId: { not: null } },
    }),
    prisma.posSession.count({ where: { deletedAt: null, parkedAt: { not: null } } }),
    prisma.quotation.count({ where: { status: "SENT" } }),
    prisma.quotation.count({
      where: {
        status: "SENT",
        validUntil: {
          gte: startOfToday,
          lt: new Date(startOfToday.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.purchaseOrder.count({
      where: {
        status: {
          in: [
            "CONFIRMED",
            "PARTIAL",
            "PARTIAL_RESENT",
            "PARTIAL_REACCEPTED",
          ],
        },
      },
    }),
    // 세금계산서 발행 대기 — 발행 요청됐고 아직 미발행
    prisma.order.count({
      where: {
        taxInvoiceRequested: true,
        taxInvoicedAt: null,
        status: { not: "CANCELLED" },
      },
    }),
    prisma.customerPayment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: startOfToday } },
    }),
    prisma.supplierPayment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: startOfToday } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { date: { gte: startOfToday } },
    }),
    prisma.customerRefund.aggregate({
      _sum: { amount: true },
      where: { refundedAt: { gte: startOfToday } },
    }),
    prisma.customerPayment.count({
      where: { paymentDate: { gte: startOfToday } },
    }),
    prisma.supplierPayment.count({
      where: { paymentDate: { gte: startOfToday } },
    }),
    prisma.expense.count({ where: { date: { gte: startOfToday } } }),
    prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    // 마진 추이 — 지난 6개월 (현재 월 포함) 모든 SOLD OrderItem
    prisma.orderItem.findMany({
      where: {
        order: {
          ...soldOrderWhere,
          orderDate: {
            gte: new Date(now.getFullYear(), now.getMonth() - 5, 1),
            lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
          },
        },
      },
      select: {
        quantity: true,
        unitCostSnapshot: true,
        totalPrice: true,
        refundedAmount: true,
        order: { select: { orderDate: true } },
        lotConsumptions: { select: { quantity: true, unitCost: true } },
      },
    }),
    // 카테고리별 매출 — 선택 기간 SOLD OrderItem + 상품 카테고리
    prisma.orderItem.findMany({
      where: {
        order: { ...soldOrderWhere, orderDate: { gte: range.from, lt: range.to } },
        productId: { not: null },
      },
      select: {
        totalPrice: true,
        refundedAmount: true,
        product: {
          select: { categoryId: true, category: { select: { name: true } } },
        },
      },
    }),
    // 수리 공임/부속 합 — 선택 기간 PICKED_UP 수리 기준
    prisma.repairLabor.aggregate({
      _sum: { totalPrice: true },
      where: {
        repairTicket: {
          status: "PICKED_UP",
          pickedUpAt: { gte: range.from, lt: range.to },
        },
      },
    }),
    prisma.repairPart.aggregate({
      _sum: { totalPrice: true },
      where: {
        repairTicket: {
          status: "PICKED_UP",
          pickedUpAt: { gte: range.from, lt: range.to },
        },
      },
    }),
    // 재수리 비율 — 선택 기간 접수된 수리 / 그 중 parentRepairTicketId 있는 것
    prisma.repairTicket.count({
      where: { receivedAt: { gte: range.from, lt: range.to } },
    }),
    prisma.repairTicket.count({
      where: {
        receivedAt: { gte: range.from, lt: range.to },
        parentRepairTicketId: { not: null },
      },
    }),
    prisma.order.findMany({
      where: { ...soldOrderWhere, orderDate: { gte: range.from, lt: range.to } },
      select: { orderDate: true, totalAmount: true },
    }),
  ]);

  // === 파생 계산 ===
  // 매출 — totalAmount 합에서 PARTIAL_REFUND 차감액(OrderItem.refundedAmount 합) 차감
  const monthlyRefundedSum = Number(
    monthlyPartialRefundAgg._sum.refundedAmount ?? 0,
  );
  const lastMonthRefundedSum = Number(
    lastMonthPartialRefundAgg._sum.refundedAmount ?? 0,
  );
  const totalMonthlySales = Math.max(
    0,
    Number(monthlySalesAgg._sum.totalAmount ?? 0) - monthlyRefundedSum,
  );
  const totalMonthlyCommission = Number(monthlySalesAgg._sum.commissionAmount ?? 0);
  const lastMonthSales = Math.max(
    0,
    Number(lastMonthSalesAgg._sum.totalAmount ?? 0) - lastMonthRefundedSum,
  );
  const monthlyExpenseTotal = Number(monthlyExpenseAgg._sum.amount ?? 0);

  // 원가 — LotConsumption 우선 (실제 FIFO 잔량 차감) + unitCostSnapshot fallback (PR2 이전 주문)
  const itemCost = (it: {
    quantity: number | string | { toString(): string };
    unitCostSnapshot: number | string | { toString(): string } | null;
    lotConsumptions: { quantity: { toString(): string }; unitCost: { toString(): string } }[];
  }) => {
    if (it.lotConsumptions.length > 0) {
      return it.lotConsumptions.reduce(
        (s, c) => s + Number(c.quantity) * Number(c.unitCost),
        0,
      );
    }
    return Number(it.unitCostSnapshot ?? 0) * Number(it.quantity ?? 0);
  };
  const monthlyCost = soldOrderItems.reduce((s, it) => s + itemCost(it), 0);
  const lastMonthCost = lastMonthSoldItems.reduce(
    (s, it) => s + itemCost(it),
    0,
  );
  const monthlyGross = totalMonthlySales - monthlyCost;
  const monthlyOperating =
    monthlyGross - totalMonthlyCommission - monthlyExpenseTotal;
  const monthlyMarginPct =
    totalMonthlySales > 0 ? (monthlyGross / totalMonthlySales) * 100 : 0;
  const lastMonthGross = lastMonthSales - lastMonthCost;

  const inventoryAssetValue = inventoryLots.reduce(
    (s, l) => s + Number(l.remainingQty ?? 0) * Number(l.unitCost ?? 0),
    0,
  );

  // 7일 일별 매출
  const dailySalesMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dailySalesMap.set(key, 0);
  }
  for (const o of last7DaysOrders) {
    const d = new Date(o.orderDate);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (dailySalesMap.has(key)) {
      dailySalesMap.set(
        key,
        (dailySalesMap.get(key) ?? 0) + Number(o.totalAmount),
      );
    }
  }
  const dailySalesData = Array.from(dailySalesMap, ([date, amount]) => ({
    date,
    amount,
  }));

  // 채널 도넛
  const channelDonutData = monthlyChannelSales.map((c) => ({
    name: c.channelName,
    value: c.totalAmount,
  }));

  // VIP / 베스트셀러 후속 페치
  const vipCustomerIds = vipGroups
    .map((g) => g.customerId)
    .filter((x): x is string => !!x);
  const vipCustomers = vipCustomerIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: vipCustomerIds } },
        select: { id: true, name: true },
      })
    : [];
  const vipRows = vipGroups.map((g) => ({
    customerId: g.customerId,
    name: vipCustomers.find((c) => c.id === g.customerId)?.name ?? "(이름없음)",
    total: Number(g._sum.totalAmount ?? 0),
    orderCount: g._count,
  }));

  const bestProductIds = bestsellerGroups
    .map((g) => g.productId)
    .filter((x): x is string => !!x);
  const bestProducts = bestProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: bestProductIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  const bestRows = bestsellerGroups.map((g) => ({
    productId: g.productId,
    name: bestProducts.find((p) => p.id === g.productId)?.name ?? "(삭제됨)",
    sku: bestProducts.find((p) => p.id === g.productId)?.sku ?? "",
    qty: Number(g._sum.quantity ?? 0),
    revenue: Number(g._sum.totalPrice ?? 0),
  }));

  // 평균 수리 처리시간
  const repairLeadDays =
    recentPickedUps.length > 0
      ? recentPickedUps.reduce((s, t) => {
          if (!t.pickedUpAt) return s;
          const ms =
            new Date(t.pickedUpAt).getTime() - new Date(t.receivedAt).getTime();
          return s + ms / (24 * 60 * 60 * 1000);
        }, 0) / recentPickedUps.length
      : null;

  // 미수금 30일+ 정밀 — 잔액 > 0 인 고객 중 첫 SALE ledger 진입일이 30일 이전인 사람만 카운트
  const oldestSaleByCustomer = new Map<string, Date>();
  for (const g of customerLedgerOldest) {
    if (g._min.createdAt) oldestSaleByCustomer.set(g.customerId, g._min.createdAt);
  }
  const overdueReceivable = unpaidCustomers.filter((c) => {
    const oldest = oldestSaleByCustomer.get(c.customerId);
    return oldest ? oldest < days30Ago : false;
  }).length;

  // 비즈니스 지표
  const monthlyOrderCountValue = monthlyOrderCount;
  const avgOrderValue =
    monthlyOrderCountValue > 0 ? totalMonthlySales / monthlyOrderCountValue : 0;
  // 반품률 — RETURNED / (정상 매출 + RETURNED). 0 분모 가드.
  const returnRateDenom = monthlyOrderCountValue + monthlyReturnedCount;
  const returnRatePct =
    returnRateDenom > 0 ? (monthlyReturnedCount / returnRateDenom) * 100 : 0;
  // 임대 가동률 — RENTED / 전체 운영 자산 (RETIRED 제외)
  const rentalUtilizationPct =
    rentalActiveAssetTotal > 0
      ? (rentalActiveAssetRented / rentalActiveAssetTotal) * 100
      : 0;
  // 재구매율 — 지난 90일 내 2회+ 구매 고객 / 90일 활성 고객
  const repurchaseActive = repurchaseGroups.length;
  const repurchaseBuyers = repurchaseGroups.filter((g) => g._count >= 2).length;
  const repurchaseRatePct =
    repurchaseActive > 0 ? (repurchaseBuyers / repurchaseActive) * 100 : 0;

  // 마진 추이 — 지난 6개월, 메모리에서 월별 그룹핑
  const trendBuckets: MarginTrendPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = trendItems.filter((it) => {
      const d = it.order.orderDate;
      return d >= monthStart && d < monthEnd;
    });
    const revenue = inMonth.reduce(
      (s, it) =>
        s + Number(it.totalPrice ?? 0) - Number(it.refundedAmount ?? 0),
      0,
    );
    const cost = inMonth.reduce((s, it) => s + itemCost(it), 0);
    trendBuckets.push({
      month: `${monthStart.getMonth() + 1}월`,
      revenue,
      marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    });
  }

  // 카테고리별 매출 도넛
  const categoryMap = new Map<string, { name: string; value: number }>();
  for (const it of categoryItems) {
    const catId = it.product?.categoryId ?? "__none__";
    const catName = it.product?.category?.name ?? "(미분류)";
    const value = Number(it.totalPrice ?? 0) - Number(it.refundedAmount ?? 0);
    const prev = categoryMap.get(catId);
    if (prev) prev.value += value;
    else categoryMap.set(catId, { name: catName, value });
  }
  const categoryDonutData = Array.from(categoryMap.values())
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // 효율 지표 — 재고 회전율 / DoI
  const periodDays = Math.max(
    1,
    Math.round((range.to.getTime() - range.from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  // 회전율 = 기간 매출원가 / 현재 재고 자산 (회). 재고 0 이면 null
  const inventoryTurnover =
    inventoryAssetValue > 0 ? monthlyCost / inventoryAssetValue : null;
  // DoI = 현재 재고 자산 / 일평균 매출원가 (일). 매출원가 0 이면 null
  const daysOfInventory =
    monthlyCost > 0 ? inventoryAssetValue / (monthlyCost / periodDays) : null;

  // 수리 공임:부속 비율
  const repairLaborTotal = Number(repairLaborAgg._sum.totalPrice ?? 0);
  const repairPartTotal = Number(repairPartAgg._sum.totalPrice ?? 0);
  const repairLaborPartTotal = repairLaborTotal + repairPartTotal;
  const laborSharePct =
    repairLaborPartTotal > 0
      ? (repairLaborTotal / repairLaborPartTotal) * 100
      : 0;
  // 재수리 비율
  const rerepairRatePct =
    periodRepairCount > 0
      ? (periodRerepairCount / periodRepairCount) * 100
      : 0;

  // 시간대 히트맵 — 요일(0=일~6=토) × 시간(0~23) 매출 합
  const heatmapGrid: number[][] = Array.from({ length: 7 }, () =>
    Array(24).fill(0),
  );
  let heatmapMax = 0;
  for (const o of heatmapOrders) {
    const d = new Date(o.orderDate);
    const v = (heatmapGrid[d.getDay()][d.getHours()] += Number(o.totalAmount));
    if (v > heatmapMax) heatmapMax = v;
  }

  // 결제 수단 분포
  const paymentMixData = paymentMethodGroups
    .map((g) => ({
      name: PAYMENT_METHOD_LABEL[g.paymentMethod ?? ""] ?? "기타",
      value: Number(g._sum.totalAmount ?? 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalUnpaidSuppliers = unpaidSuppliers.reduce((s, u) => s + u.balance, 0);
  const totalUnpaidCustomers = unpaidCustomers.reduce((s, u) => s + u.balance, 0);

  const todayReceivedAmount = Number(todayReceived._sum.amount ?? 0);
  const todayPaidAmount = Number(todayPaid._sum.amount ?? 0);
  const todayExpenseAmount = Number(todayExpense._sum.amount ?? 0);
  const todayRefundAmount = Number(todayRefund._sum.amount ?? 0);
  const netCashFlow =
    todayReceivedAmount -
    todayPaidAmount -
    todayExpenseAmount -
    todayRefundAmount;

  const claimsTotal = claimsPending + refundPending;
  const channelIssuesTotal = outboundFailed + pendingChannelOrders;

  const salesDelta = delta(totalMonthlySales, lastMonthSales);
  const grossDelta = delta(monthlyGross, lastMonthGross);

  const colored = (n: number, tone: "warning" | "danger") =>
    n > 0 ? (
      <span
        className={
          tone === "danger"
            ? "text-[var(--jm-danger-fg)]"
            : "text-[var(--jm-warning-fg)]"
        }
      >
        {n}건
      </span>
    ) : (
      `${n}건`
    );

  const firstName = user.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";
  // 재무 민감 정보 (매출·이익·자산·현금흐름·금액 테이블) 는 ADMIN 만. STAFF 는 운영 대시보드.
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-jm-2xl font-bold tracking-tight text-[var(--jm-text)]">
              안녕하세요{firstName ? `, ${firstName}` : ""} 👋
            </h1>
            <p className="mt-1 text-jm-sm text-[var(--jm-text-muted)]">
              {now.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
              {" · "}매출·이익 KPI 는 선택 기간 기준입니다.{" "}
              <Link
                href="/help"
                className="font-medium text-[var(--jm-text)] underline underline-offset-2 hover:text-[var(--jm-action)]"
              >
                가이드
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton renderedAt={now.toISOString()} />
            <PeriodToggle
              value={period}
              customFrom={params.from}
              customTo={params.to}
            />
          </div>
        </div>

        {/* 빠른 액션 + 글로벌 검색 */}
        <QuickActionsBar />

        {/* 사장 KPI — 매출/마진/영업이익/재고자산 (4). ADMIN 전용 */}
        {isAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ClickableStat
            href="/sales/history"
            label={`${monthLabel} 매출`}
            value={`₩${fmtCompact(totalMonthlySales)}`}
            icon={<TrendingUp className="size-4" />}
            delta={salesDelta ?? undefined}
            compareLabel={range.compareLabel}
            hint={salesDelta === null ? "지난달 데이터 없음" : undefined}
            size="sm"
          />
          <ClickableStat
            href="/sales/history"
            label={`${monthLabel} 매출총이익`}
            value={`₩${fmtCompact(monthlyGross)}`}
            icon={<Sparkles className="size-4" />}
            delta={grossDelta ?? undefined}
            compareLabel={range.compareLabel}
            hint={
              grossDelta === null
                ? `마진율 ${monthlyMarginPct.toFixed(1)}%`
                : `마진율 ${monthlyMarginPct.toFixed(1)}%`
            }
            size="sm"
          />
          <ClickableStat
            href="/reports/income-statement"
            label={`${monthLabel} 영업이익`}
            value={
              <span
                className={
                  monthlyOperating < 0
                    ? "text-[var(--jm-danger-fg)]"
                    : undefined
                }
              >
                ₩{fmtCompact(monthlyOperating)}
              </span>
            }
            icon={<Banknote className="size-4" />}
            hint={`수수료 ${fmtCompact(totalMonthlyCommission)} · 비용 ${fmtCompact(monthlyExpenseTotal)}`}
            size="sm"
          />
          <ClickableStat
            href="/inventory/lots"
            label="재고 자산"
            value={`₩${fmtCompact(inventoryAssetValue)}`}
            icon={<Package className="size-4" />}
            hint={`활성 로트 ${fmt(inventoryLots.length)}`}
            size="sm"
          />
        </div>
        )}

        {/* 운영 알람 — 클레임/채널/대기주문/재고경고/입고/POS/수리/임대 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <ClickableStat
            href="/orders"
            label="대기 주문"
            value={colored(pendingOrders, "warning")}
            icon={<ShoppingCart className="size-4" />}
            hint="접수 — 출고대기 전환 필요"
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/orders/claims"
            label="클레임 대기"
            value={colored(claimsTotal, "danger")}
            icon={<RotateCcw className="size-4" />}
            hint={
              refundPending > 0
                ? `환불 진행 ${refundPending} · 반품/검수 ${claimsPending}`
                : `반품·검수 ${claimsPending}`
            }
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/channels/imports"
            label="채널 이슈"
            value={colored(channelIssuesTotal, "danger")}
            icon={<Wifi className="size-4" />}
            hint={
              channelIssuesTotal > 0
                ? `송장실패 ${outboundFailed} · 보류큐 ${pendingChannelOrders}`
                : "정상"
            }
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/inventory/lots"
            label="재고 경고"
            value={colored(lowStockItems.length, "danger")}
            icon={<AlertTriangle className="size-4" />}
            hint="안전재고 미달"
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/inventory/incoming"
            label="대기 입고"
            value={colored(pendingIncoming, "warning")}
            icon={<PackageOpen className="size-4" />}
            hint="확정 대기 중"
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/pos"
            label="POS 활성"
            value={`${activePosSessions + parkedPosSessions}건`}
            icon={<ShoppingCart className="size-4" />}
            hint={`진행 ${activePosSessions} · 저장 ${parkedPosSessions}`}
            size="sm"
          />
          <ClickableStat
            href="/repairs"
            label="수리"
            value={`${activeRepairs}건`}
            icon={<Wrench className="size-4" />}
            hint={
              repairReady > 0 || repairQuoted > 0 ? (
                <span>
                  수령대기{" "}
                  <span
                    className={
                      repairReady > 0 ? "text-[var(--jm-warning-fg)]" : ""
                    }
                  >
                    {repairReady}
                  </span>
                  {repairReadyOver7d > 0 && (
                    <span className="text-[var(--jm-danger-fg)]">
                      {" "}(7d+ {repairReadyOver7d})
                    </span>
                  )}
                  {" · 견적응답 "}
                  <span
                    className={
                      repairQuoted > 0 ? "text-[var(--jm-warning-fg)]" : ""
                    }
                  >
                    {repairQuoted}
                  </span>
                  {repairLeadDays !== null && (
                    <>
                      {" · 평균 "}
                      {repairLeadDays.toFixed(1)}일
                    </>
                  )}
                </span>
              ) : (
                "전부 처리됨"
              )
            }
            size="sm"
          />
          <ClickableStat
            href="/rentals"
            label="임대"
            value={`${activeRentals + overdueRentals}건`}
            icon={<Container className="size-4" />}
            hint={
              <span>
                활성 {activeRentals}
                {overdueRentals > 0 && (
                  <>
                    {" · 연체 "}
                    <span className="text-[var(--jm-danger-fg)]">
                      {overdueRentals}
                    </span>
                  </>
                )}
                {rentalReturnToday > 0 && (
                  <>
                    {" · 오늘반환 "}
                    <span className="text-[var(--jm-warning-fg)]">
                      {rentalReturnToday}
                    </span>
                  </>
                )}
              </span>
            }
            positiveIsGood={false}
            size="sm"
          />
        </div>

        {/* 워크플로 대기 — 발주/견적/세금계산서/신규고객/미수금. 모바일은 토글로 펼침. */}
        <CollapsibleKpiSection label="워크플로 대기 KPI 보기" cols={5}>
          <ClickableStat
            href="/tax-invoices/pending"
            label="세금계산서 발행"
            value={
              taxInvoicePending > 0 ? (
                <span className="text-[var(--jm-warning-fg)]">
                  {taxInvoicePending}건
                </span>
              ) : (
                "0건"
              )
            }
            icon={<FileText className="size-4" />}
            hint="발행 요청 — 미발행"
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/purchase-orders"
            label="발주 입고 대기"
            value={`${pendingPurchaseOrders}건`}
            icon={<Hourglass className="size-4" />}
            hint="CONFIRMED · PARTIAL"
            size="sm"
          />
          <ClickableStat
            href="/quotations"
            label="견적서 응답 대기"
            value={
              quotationsExpiringSoon > 0 ? (
                <span>
                  {quotationsSent}
                  <span className="text-jm-sm text-[var(--jm-warning-fg)]">
                    {" "}(만료임박 {quotationsExpiringSoon})
                  </span>
                </span>
              ) : (
                `${quotationsSent}건`
              )
            }
            icon={<FileText className="size-4" />}
            hint="SENT 상태"
            size="sm"
          />
          <ClickableStat
            href="/customers"
            label={`${monthLabel} 신규 고객`}
            value={`${newCustomersCount}명`}
            icon={<UserPlus className="size-4" />}
            hint={`최근 30일 활성 ${activeCustomersCount}`}
            size="sm"
          />
          <ClickableStat
            href="/customers/ledger"
            label="30일+ 미수금"
            value={
              overdueReceivable > 0 ? (
                <span className="text-[var(--jm-warning-fg)]">
                  {overdueReceivable}명
                </span>
              ) : (
                "0명"
              )
            }
            icon={<AlertCircle className="size-4" />}
            hint={`전체 미수 ${unpaidCustomers.length}명 · ₩${fmtCompact(totalUnpaidCustomers)}`}
            positiveIsGood={false}
            size="sm"
          />
        </CollapsibleKpiSection>

        {/* 비즈니스 지표 + 효율 지표 — 재무 파생. ADMIN 전용 */}
        {isAdmin && (
        <>
        <CollapsibleKpiSection label="비즈니스 지표 보기">
          <ClickableStat
            href="/sales/history"
            label="객단가 (AOV)"
            value={`₩${fmtCompact(avgOrderValue)}`}
            icon={<TrendingUp className="size-4" />}
            hint={`이번 달 ${fmt(monthlyOrderCountValue)}건 평균`}
            size="sm"
          />
          <ClickableStat
            href="/orders/claims"
            label="반품률"
            value={`${returnRatePct.toFixed(1)}%`}
            icon={<RotateCcw className="size-4" />}
            hint={`반품 ${monthlyReturnedCount} / 정상+반품 ${returnRateDenom}`}
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/customers"
            label="재구매율 (90일)"
            value={`${repurchaseRatePct.toFixed(1)}%`}
            icon={<Sparkles className="size-4" />}
            hint={`2회+ ${repurchaseBuyers} / 활성 ${repurchaseActive}`}
            size="sm"
          />
          <ClickableStat
            href="/rental-assets"
            label="임대 가동률"
            value={`${rentalUtilizationPct.toFixed(1)}%`}
            icon={<Container className="size-4" />}
            hint={`임대 중 ${rentalActiveAssetRented} / 운영 자산 ${rentalActiveAssetTotal}`}
            size="sm"
          />
        </CollapsibleKpiSection>

        {/* 효율 지표 — 재고 회전율/DoI/공임:부속/재수리율. 모바일은 토글. */}
        <CollapsibleKpiSection label="효율 지표 보기">
          <ClickableStat
            href="/inventory/lots"
            label="재고 회전율"
            value={
              inventoryTurnover === null
                ? "—"
                : `${inventoryTurnover.toFixed(2)}회`
            }
            icon={<Package className="size-4" />}
            hint={`${monthLabel} 매출원가 / 재고 자산`}
            size="sm"
          />
          <ClickableStat
            href="/inventory/lots"
            label="재고 소진일수 (DoI)"
            value={
              daysOfInventory === null
                ? "—"
                : `${Math.round(daysOfInventory)}일`
            }
            icon={<Hourglass className="size-4" />}
            hint="현재 재고 ÷ 일평균 매출원가"
            positiveIsGood={false}
            size="sm"
          />
          <ClickableStat
            href="/repairs"
            label="수리 공임 비중"
            value={
              repairLaborPartTotal > 0 ? `${laborSharePct.toFixed(0)}%` : "—"
            }
            icon={<Wrench className="size-4" />}
            hint={
              repairLaborPartTotal > 0
                ? `공임 ${fmtCompact(repairLaborTotal)} · 부속 ${fmtCompact(repairPartTotal)}`
                : "수령 완료 수리 없음"
            }
            size="sm"
          />
          <ClickableStat
            href="/repairs"
            label="재수리율"
            value={
              periodRepairCount > 0 ? `${rerepairRatePct.toFixed(1)}%` : "—"
            }
            icon={<RotateCcw className="size-4" />}
            hint={`재수리 ${periodRerepairCount} / 접수 ${periodRepairCount}`}
            positiveIsGood={false}
            size="sm"
          />
        </CollapsibleKpiSection>
        </>
        )}

        {/* 오늘 현금흐름 + 차트 — 재무·매출. ADMIN 전용 */}
        {isAdmin && (
        <>
        <JmCard className="overflow-hidden p-0">
          <SectionHeader
            title="오늘 현금흐름"
            meta={todayLabel}
            href="/sales/history"
            linkLabel="판매내역"
          />
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--jm-border)] md:grid-cols-4 md:divide-y-0">
            <CashCell
              label="고객 결제"
              icon={<ArrowDownCircle className="size-4" />}
              amount={todayReceivedAmount}
              count={todayReceivedCount}
              tone="success"
            />
            <CashCell
              label="거래처 지급"
              icon={<ArrowUpCircle className="size-4" />}
              amount={-todayPaidAmount}
              count={todayPaidCount}
              tone="danger"
            />
            <CashCell
              label="지출"
              icon={<Receipt className="size-4" />}
              amount={-todayExpenseAmount}
              count={todayExpenseCount}
              tone="danger"
            />
            <CashCell
              label="순 현금흐름"
              icon={<AlertCircle className="size-4" />}
              amount={netCashFlow}
              count={null}
              tone={netCashFlow >= 0 ? "success" : "danger"}
              hint={
                todayRefundAmount > 0
                  ? `환불 ₩${fmt(todayRefundAmount)} 반영`
                  : undefined
              }
            />
          </div>
        </JmCard>

        {/* 차트 row 1 — 추세 (7일 매출 + 6개월 마진율) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title="지난 7일 매출 추이" />
            <div className="px-3 py-3">
              <DailySalesArea data={dailySalesData} />
            </div>
          </JmCard>
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title="최근 6개월 마진율" />
            <div className="px-3 py-3">
              <MarginTrendLine data={trendBuckets} />
            </div>
          </JmCard>
        </div>

        {/* 차트 row 2 — 분포 (채널 / 결제수단 / 카테고리) */}
        <div className="grid gap-6 lg:grid-cols-3">
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title={`${monthLabel} 채널별 매출`} />
            <div className="px-5 py-3">
              {channelDonutData.length === 0 ? (
                <p className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  매출 없음
                </p>
              ) : (
                <ChannelDonut data={channelDonutData} />
              )}
            </div>
          </JmCard>
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title={`${monthLabel} 결제 수단`} />
            <div className="px-5 py-5">
              <PaymentMixBars data={paymentMixData} />
            </div>
          </JmCard>
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title={`${monthLabel} 카테고리별 매출`} />
            <div className="px-5 py-3">
              {categoryDonutData.length === 0 ? (
                <p className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  매출 없음
                </p>
              ) : (
                <ChannelDonut data={categoryDonutData} />
              )}
            </div>
          </JmCard>
        </div>

        {/* 시간대 히트맵 — 요일×시간 매출 분포 */}
        <JmCard className="overflow-hidden p-0">
          <SectionHeader title={`${monthLabel} 요일·시간대 매출 분포`} />
          <div className="px-5 py-4">
            <SalesHeatmap grid={heatmapGrid} max={heatmapMax} />
          </div>
        </JmCard>
        </>
        )}

        {/* 테이블 섹션 1 — 최근 주문 / 베스트셀러 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <JmCard className="overflow-hidden p-0">
            <SectionHeader title="최근 주문" href="/orders" linkLabel="전체 보기" />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>주문번호</JmTableHead>
                  <JmTableHead>채널</JmTableHead>
                  <JmTableHead>상태</JmTableHead>
                  <JmTableHead className="text-right">금액</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {recentOrders.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={4}
                      className="py-8 text-center text-[var(--jm-text-muted)]"
                    >
                      주문이 없습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  recentOrders.map((order) => {
                    const s = statusBadge[order.status] ?? {
                      label: order.status,
                      variant: "default" as const,
                    };
                    return (
                      <JmTableRow key={order.id}>
                        <JmTableCell className="font-medium">
                          {order.orderNo}
                        </JmTableCell>
                        <JmTableCell>
                          {order.channel?.name ?? "오프라인"}
                        </JmTableCell>
                        <JmTableCell>
                          <JmBadge variant={s.variant} size="sm">
                            {s.label}
                          </JmBadge>
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums">
                          ₩{Number(order.totalAmount).toLocaleString("ko-KR")}
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>

          <JmCard className="overflow-hidden p-0">
            <SectionHeader
              title={`${monthLabel} 베스트셀러`}
              href="/products"
              linkLabel="상품"
              csv={{
                filename: `베스트셀러_${monthLabel}`,
                headers: ["상품", "SKU", "판매수량", "매출"],
                rows: bestRows.map((r) => [r.name, r.sku, r.qty, r.revenue]),
              }}
            />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>상품</JmTableHead>
                  <JmTableHead>SKU</JmTableHead>
                  <JmTableHead className="text-right">판매</JmTableHead>
                  <JmTableHead className="text-right">매출</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {bestRows.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={4}
                      className="py-8 text-center text-[var(--jm-text-muted)]"
                    >
                      판매 데이터 없음
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  bestRows.map((r) => (
                    <JmTableRow key={r.productId}>
                      <JmTableCell className="font-medium">{r.name}</JmTableCell>
                      <JmTableCell>
                        {r.sku && (
                          <JmBadge variant="outline" size="sm" shape="square">
                            {r.sku}
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {fmt(r.qty)}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{fmtCompact(r.revenue)}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>

        {/* 테이블 섹션 2 — 데드스톡 / 재고 부족 */}
        <div className="grid gap-6 lg:grid-cols-2">
          <JmCard className="overflow-hidden p-0">
            <SectionHeader
              title="데드스톡 — 90일+ 미판매"
              href="/inventory/lots"
              linkLabel="로트 현황"
              csv={{
                filename: "데드스톡_90일이상",
                headers: ["상품", "잔량", "입고일"],
                rows: deadstockLots.map((lot) => [
                  lot.product?.name ?? "(상품 없음)",
                  Number(lot.remainingQty),
                  new Date(lot.receivedAt).toLocaleDateString("ko-KR"),
                ]),
              }}
            />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>상품</JmTableHead>
                  <JmTableHead className="text-right">잔량</JmTableHead>
                  <JmTableHead className="text-right">입고일</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {deadstockLots.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={3}
                      className="py-8 text-center text-[var(--jm-success-fg)]"
                    >
                      90일+ 데드스톡 없음
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  deadstockLots.map((lot) => (
                    <JmTableRow key={lot.id}>
                      <JmTableCell className="font-medium">
                        {lot.product?.name ?? "(상품 없음)"}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-danger-fg)]">
                        {fmt(Number(lot.remainingQty))}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {new Date(lot.receivedAt).toLocaleDateString("ko-KR")}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>

          <JmCard className="overflow-hidden p-0">
            <SectionHeader
              title="재고 부족 경고"
              href="/inventory/lots"
              linkLabel="로트 현황"
            />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>상품</JmTableHead>
                  <JmTableHead>SKU</JmTableHead>
                  <JmTableHead className="text-right">현재고</JmTableHead>
                  <JmTableHead className="text-right">안전재고</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {lowStockItems.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={4}
                      className="py-8 text-center text-[var(--jm-success-fg)]"
                    >
                      모든 재고 정상
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  lowStockItems.slice(0, 5).map((inv) => (
                    <JmTableRow key={inv.id}>
                      <JmTableCell className="font-medium">
                        {inv.product.name}
                      </JmTableCell>
                      <JmTableCell>
                        <JmBadge variant="outline" size="sm" shape="square">
                          {inv.product.sku}
                        </JmBadge>
                      </JmTableCell>
                      <JmTableCell className="text-right font-medium tabular-nums text-[var(--jm-danger-fg)]">
                        {Number(inv.quantity).toLocaleString()}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {Number(inv.safetyStock).toLocaleString()}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>

        {/* 테이블 섹션 3·4 — VIP·거래처 미지급·고객 미수금 (금액). ADMIN 전용 */}
        {isAdmin && (
        <>
        <div className="grid gap-6 lg:grid-cols-2">
          <JmCard className="overflow-hidden p-0">
            <SectionHeader
              title={`${monthLabel} VIP 고객`}
              href="/customers"
              linkLabel="고객"
              csv={{
                filename: `VIP고객_${monthLabel}`,
                headers: ["고객", "주문수", "매출"],
                rows: vipRows.map((v) => [v.name, v.orderCount, v.total]),
              }}
            />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>
                    <Star className="inline size-3.5" /> 고객
                  </JmTableHead>
                  <JmTableHead className="text-right">주문</JmTableHead>
                  <JmTableHead className="text-right">매출</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {vipRows.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={3}
                      className="py-8 text-center text-[var(--jm-text-muted)]"
                    >
                      이번 달 단골 데이터 없음
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  vipRows.map((v) => (
                    <JmTableRow key={v.customerId}>
                      <JmTableCell className="font-medium">{v.name}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                        {v.orderCount}건
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{fmtCompact(v.total)}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>

          <JmCard className="overflow-hidden p-0">
            <SectionHeader
              title="거래처 미지급"
              meta={
                totalUnpaidSuppliers > 0
                  ? `₩${fmt(totalUnpaidSuppliers)}`
                  : undefined
              }
              href="/suppliers/ledger"
              linkLabel="원장"
            />
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>거래처</JmTableHead>
                  <JmTableHead className="text-right">미지급 잔액</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {unpaidSuppliers.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={2}
                      className="py-8 text-center text-[var(--jm-text-muted)]"
                    >
                      미지급 없음
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  unpaidSuppliers.slice(0, 5).map((s) => (
                    <JmTableRow key={s.supplierId}>
                      <JmTableCell className="font-medium">{s.name}</JmTableCell>
                      <JmTableCell className="text-right font-medium tabular-nums text-[var(--jm-warning-fg)]">
                        ₩{fmt(s.balance)}
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCard>
        </div>

        {/* 테이블 섹션 4 — 고객 미수금 (full width) */}
        <JmCard className="overflow-hidden p-0">
          <SectionHeader
            title="고객 미수금"
            meta={
              totalUnpaidCustomers > 0
                ? `₩${fmt(totalUnpaidCustomers)}`
                : undefined
            }
            href="/customers/ledger"
            linkLabel="원장"
          />
          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead>고객</JmTableHead>
                <JmTableHead className="text-right">미수금 잔액</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {unpaidCustomers.length === 0 ? (
                <JmTableRow>
                  <JmTableCell
                    colSpan={2}
                    className="py-8 text-center text-[var(--jm-text-muted)]"
                  >
                    미수금 없음
                  </JmTableCell>
                </JmTableRow>
              ) : (
                unpaidCustomers.slice(0, 5).map((c) => (
                  <JmTableRow key={c.customerId}>
                    <JmTableCell className="font-medium">{c.name}</JmTableCell>
                    <JmTableCell className="text-right font-medium tabular-nums text-[var(--jm-warning-fg)]">
                      ₩{fmt(c.balance)}
                    </JmTableCell>
                  </JmTableRow>
                ))
              )}
            </JmTableBody>
          </JmTable>
        </JmCard>
        </>
        )}

        {/* 감사 로그 */}
        <JmCard className="overflow-hidden p-0">
          <SectionHeader
            title="최근 활동"
            href="/audit-logs"
            linkLabel="감사 로그"
          />
          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead>시간</JmTableHead>
                <JmTableHead>사용자</JmTableHead>
                <JmTableHead>작업</JmTableHead>
                <JmTableHead>대상</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {recentAudits.length === 0 ? (
                <JmTableRow>
                  <JmTableCell
                    colSpan={4}
                    className="py-8 text-center text-[var(--jm-text-muted)]"
                  >
                    감사 로그 없음
                  </JmTableCell>
                </JmTableRow>
              ) : (
                recentAudits.map((a) => (
                  <JmTableRow key={a.id}>
                    <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
                      {new Date(a.createdAt).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </JmTableCell>
                    <JmTableCell>{a.user?.name ?? "-"}</JmTableCell>
                    <JmTableCell>
                      <JmBadge variant="outline" size="sm" shape="square">
                        {a.action}
                      </JmBadge>
                    </JmTableCell>
                    <JmTableCell className="text-[var(--jm-text-muted)]">
                      {a.entity}
                    </JmTableCell>
                  </JmTableRow>
                ))
              )}
            </JmTableBody>
          </JmTable>
        </JmCard>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  meta,
  href,
  linkLabel,
  csv,
}: {
  title: string;
  meta?: string;
  href?: string;
  linkLabel?: string;
  csv?: CsvData;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--jm-border)] px-5 py-3">
      <div className="flex items-center gap-2">
        <h3 className="text-jm-sm font-semibold text-[var(--jm-text)]">
          {title}
        </h3>
        {meta && (
          <span className="text-jm-xs tabular-nums text-[var(--jm-text-muted)]">
            {meta}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {csv && <CsvButton {...csv} />}
        {href && linkLabel && (
          <Link href={href}>
            <JmButton variant="ghost" size="xs" className="gap-1">
              {linkLabel}
              <ArrowRight className="size-3" />
            </JmButton>
          </Link>
        )}
      </div>
    </div>
  );
}

const HEATMAP_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function SalesHeatmap({ grid, max }: { grid: number[][]; max: number }) {
  if (max === 0) {
    return (
      <p className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
        선택 기간 매출 데이터 없음
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* 시간 헤더 */}
        <div className="flex">
          <div className="w-7 shrink-0" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="flex-1 text-center text-jm-3xs text-[var(--jm-text-muted)]"
            >
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>
        {/* 요일 행 */}
        {grid.map((row, wd) => (
          <div key={wd} className="flex items-center">
            <div className="w-7 shrink-0 text-jm-2xs text-[var(--jm-text-muted)]">
              {HEATMAP_WEEKDAYS[wd]}
            </div>
            {row.map((v, h) => {
              const ratio = v / max;
              return (
                <div
                  key={h}
                  className="flex-1 p-px"
                  title={`${HEATMAP_WEEKDAYS[wd]}요일 ${h}시 · ₩${fmt(v)}`}
                >
                  <div
                    className="h-5 rounded-sm"
                    style={
                      ratio > 0
                        ? {
                            backgroundColor: "var(--jm-action)",
                            opacity: 0.15 + ratio * 0.85,
                          }
                        : { backgroundColor: "var(--jm-surface-muted)" }
                    }
                  />
                </div>
              );
            })}
          </div>
        ))}
        <p className="mt-2 text-jm-2xs text-[var(--jm-text-muted)]">
          진한 칸일수록 매출이 높은 시간대입니다. 칸에 마우스를 올리면 금액이
          표시됩니다.
        </p>
      </div>
    </div>
  );
}

function CashCell({
  label,
  icon,
  amount,
  count,
  tone,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  amount: number;
  count: number | null;
  tone: "success" | "danger" | "muted";
  hint?: string;
}) {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const toneClass =
    amount === 0
      ? "text-[var(--jm-text)]"
      : tone === "success"
        ? "text-[var(--jm-success-fg)]"
        : "text-[var(--jm-danger-fg)]";
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <div className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
        <span className="text-[var(--jm-text-muted)]">{icon}</span>
        {label}
      </div>
      <div className={`text-jm-xl font-bold tabular-nums ${toneClass}`}>
        {sign}₩{Math.round(abs).toLocaleString("ko-KR")}
      </div>
      <div className="text-jm-xs text-[var(--jm-text-muted)]">
        {count !== null ? `${count}건` : hint ?? "전체 합산"}
      </div>
    </div>
  );
}
