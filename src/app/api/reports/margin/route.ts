import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 매출 마진 리포트 — 기간/채널 기준 집계
// 기준: 주문 status가 CONFIRMED, PREPARING, SHIPPED, DELIVERED 인 OrderItem
//       (PENDING, CANCELLED, RETURNED 제외)
//
// 계산 (각 OrderItem):
//   revenue        = totalPrice  (VAT 포함 매출)
//   supplyRevenue  = totalPrice / (1 + product.taxRate)  (공급가액)
//   costAmount     = Σ(LotConsumption.quantity × LotConsumption.unitCost)
//                    (LotConsumption 없으면 unitCostSnapshot × quantity로 폴백)
//   commissionAmt  = totalPrice × channelCommissionRateSnapshot
//   cardFeeAmt     = totalPrice × cardFeeRateSnapshot (오프라인만)
//   sellingCostAmt = sellingCostSnapshot × quantity (주문 확정 시 스냅샷된 단위당 판매비용)
//
// 기간 단위 (summary 전용 — 주문 행에는 반영 안 함):
//   opexAmount     = Σ Expense.amount (isTaxable이면 / 1.1로 공급가액 환산)
//   netProfit(summary) = supplyRevenue − costAmount − commissionAmt − cardFeeAmt − sellingCostAmt − opexAmount
//   marginRate     = netProfit / supplyRevenue × 100

const ACTIVE_STATUSES = ["CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED"] as const;

interface OrderSummary {
  id: string;
  orderNo: string;
  orderDate: Date;
  channelName: string;
  itemCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount: number;
  netProfit: number;
  marginRate: number;
}

interface PeriodAggregate {
  orderCount: number;
  itemCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount: number;
  opexAmount: number;
  opexByCategory: { category: string; amount: number }[];
  netProfit: number;
  marginRate: number;
}

interface ChannelGroup {
  channelId: string | null;
  channelName: string;
  orderCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount: number;
  netProfit: number;
  marginRate: number;
}

interface ProductGroup {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  netProfit: number;
  marginRate: number;
}

interface CategoryGroup {
  categoryId: string | null;
  categoryName: string;
  quantity: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount: number;
  netProfit: number;
  marginRate: number;
}

async function aggregate(from: Date, to: Date, channelId: string | null) {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      orderDate: { gte: from, lt: to },
      ...(channelId ? { channelId } : {}),
    },
    include: {
      channel: { select: { id: true, name: true, code: true } },
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, sku: true, taxType: true, taxRate: true,
              categoryId: true,
              category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
            },
          },
          lotConsumptions: { select: { quantity: true, unitCost: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });

  const orderRows: OrderSummary[] = [];
  const summary: PeriodAggregate = {
    orderCount: 0,
    itemCount: 0,
    revenue: 0,
    supplyRevenue: 0,
    costAmount: 0,
    commissionAmount: 0,
    cardFeeAmount: 0,
    sellingCostAmount: 0,
    opexAmount: 0,
    opexByCategory: [],
    netProfit: 0,
    marginRate: 0,
  };

  // 기간 내 경비(Expense) 집계 — 공급가액 환산 후 카테고리별 합산
  const expensesInPeriod = await prisma.expense.findMany({
    where: { date: { gte: from, lt: to }, recoverable: false },
    select: { category: true, amount: true, isTaxable: true },
  });
  const opexMap: Record<string, number> = {};
  let opexTotal = 0;
  for (const e of expensesInPeriod) {
    const raw = Number(e.amount);
    const net = e.isTaxable ? raw / 1.1 : raw;
    opexTotal += net;
    opexMap[e.category] = (opexMap[e.category] ?? 0) + net;
  }
  summary.opexAmount = opexTotal;
  summary.opexByCategory = Object.entries(opexMap).map(([category, amount]) => ({
    category,
    amount: Math.round(amount),
  }));

  const channelMap = new Map<string, ChannelGroup>();
  const productMap = new Map<string, ProductGroup>();
  const categoryMap = new Map<string, CategoryGroup>();

  for (const order of orders) {
    let oRevenue = 0,
      oSupply = 0,
      oCost = 0,
      oComm = 0,
      oCard = 0,
      oSelling = 0;

    const chId = order.channel?.id ?? "__none__";
    const chName = order.channel?.name ?? "—";
    if (!channelMap.has(chId)) {
      channelMap.set(chId, {
        channelId: order.channel?.id ?? null,
        channelName: chName,
        orderCount: 0,
        revenue: 0,
        supplyRevenue: 0,
        costAmount: 0,
        commissionAmount: 0,
        cardFeeAmount: 0,
        sellingCostAmount: 0,
        netProfit: 0,
        marginRate: 0,
      });
    }
    const chGroup = channelMap.get(chId)!;
    chGroup.orderCount += 1;

    for (const item of order.items) {
      if (!item.product) continue; // 서비스 항목(수리/임대)은 마진 집계 스킵
      const qty = Number(item.quantity);
      const totalPrice = Number(item.totalPrice);
      const taxRate =
        item.product.taxType === "TAXABLE" ? Number(item.product.taxRate) : 0;
      const supplyRevenue = taxRate > 0 ? totalPrice / (1 + taxRate) : totalPrice;
      // 원가: LotConsumption 합계 우선, 없으면 unitCostSnapshot × qty로 폴백
      const lotCost = item.lotConsumptions.reduce(
        (s, lc) => s + Number(lc.quantity) * Number(lc.unitCost),
        0,
      );
      const cost =
        item.lotConsumptions.length > 0
          ? lotCost
          : item.unitCostSnapshot != null
            ? Number(item.unitCostSnapshot) * qty
            : 0;
      const commRate =
        item.channelCommissionRateSnapshot != null
          ? Number(item.channelCommissionRateSnapshot)
          : 0;
      const cardRate =
        item.cardFeeRateSnapshot != null ? Number(item.cardFeeRateSnapshot) : 0;
      const commission = totalPrice * commRate;
      const cardFee = totalPrice * cardRate;
      const sellingCost =
        item.sellingCostSnapshot != null ? Number(item.sellingCostSnapshot) * qty : 0;

      oRevenue += totalPrice;
      oSupply += supplyRevenue;
      oCost += cost;
      oComm += commission;
      oCard += cardFee;
      oSelling += sellingCost;

      // 채널 누적
      chGroup.revenue += totalPrice;
      chGroup.supplyRevenue += supplyRevenue;
      chGroup.costAmount += cost;
      chGroup.commissionAmount += commission;
      chGroup.cardFeeAmount += cardFee;
      chGroup.sellingCostAmount += sellingCost;

      // 상품 누적
      const pKey = item.product.id;
      if (!productMap.has(pKey)) {
        productMap.set(pKey, {
          productId: item.product.id,
          productName: item.product.name,
          sku: item.product.sku,
          quantity: 0,
          revenue: 0,
          supplyRevenue: 0,
          costAmount: 0,
          netProfit: 0,
          marginRate: 0,
        });
      }
      const pGroup = productMap.get(pKey)!;
      pGroup.quantity += qty;
      pGroup.revenue += totalPrice;
      pGroup.supplyRevenue += supplyRevenue;
      pGroup.costAmount += cost;
      // 상품의 net profit은 수수료/카드료/판매비용 차감 포함
      pGroup.netProfit += supplyRevenue - cost - commission - cardFee - sellingCost;

      // 카테고리 누적 — 소분류가 있으면 소분류, 없으면 대분류, 둘 다 없으면 "미분류"
      const cat = item.product.category;
      const catKey = cat?.id ?? "__none__";
      const catName = cat ? (cat.parent ? `${cat.parent.name} > ${cat.name}` : cat.name) : "미분류";
      if (!categoryMap.has(catKey)) {
        categoryMap.set(catKey, {
          categoryId: cat?.id ?? null,
          categoryName: catName,
          quantity: 0,
          revenue: 0,
          supplyRevenue: 0,
          costAmount: 0,
          commissionAmount: 0,
          cardFeeAmount: 0,
          sellingCostAmount: 0,
          netProfit: 0,
          marginRate: 0,
        });
      }
      const cGroup = categoryMap.get(catKey)!;
      cGroup.quantity += qty;
      cGroup.revenue += totalPrice;
      cGroup.supplyRevenue += supplyRevenue;
      cGroup.costAmount += cost;
      cGroup.commissionAmount += commission;
      cGroup.cardFeeAmount += cardFee;
      cGroup.sellingCostAmount += sellingCost;
      cGroup.netProfit += supplyRevenue - cost - commission - cardFee - sellingCost;
    }

    const oNetProfit = oSupply - oCost - oComm - oCard - oSelling;
    const oMarginRate = oSupply > 0 ? (oNetProfit / oSupply) * 100 : 0;

    orderRows.push({
      id: order.id,
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      channelName: chName,
      itemCount: order.items.length,
      revenue: Math.round(oRevenue),
      supplyRevenue: Math.round(oSupply),
      costAmount: Math.round(oCost),
      commissionAmount: Math.round(oComm),
      cardFeeAmount: Math.round(oCard),
      sellingCostAmount: Math.round(oSelling),
      netProfit: Math.round(oNetProfit),
      marginRate: Number(oMarginRate.toFixed(1)),
    });

    summary.orderCount += 1;
    summary.itemCount += order.items.length;
    summary.revenue += oRevenue;
    summary.supplyRevenue += oSupply;
    summary.costAmount += oCost;
    summary.commissionAmount += oComm;
    summary.cardFeeAmount += oCard;
    summary.sellingCostAmount += oSelling;
  }

  summary.netProfit =
    summary.supplyRevenue -
    summary.costAmount -
    summary.commissionAmount -
    summary.cardFeeAmount -
    summary.sellingCostAmount -
    summary.opexAmount;
  summary.marginRate =
    summary.supplyRevenue > 0 ? (summary.netProfit / summary.supplyRevenue) * 100 : 0;

  summary.revenue = Math.round(summary.revenue);
  summary.supplyRevenue = Math.round(summary.supplyRevenue);
  summary.costAmount = Math.round(summary.costAmount);
  summary.commissionAmount = Math.round(summary.commissionAmount);
  summary.cardFeeAmount = Math.round(summary.cardFeeAmount);
  summary.sellingCostAmount = Math.round(summary.sellingCostAmount);
  summary.opexAmount = Math.round(summary.opexAmount);
  summary.netProfit = Math.round(summary.netProfit);
  summary.marginRate = Number(summary.marginRate.toFixed(1));

  // 채널 그룹 마무리
  const channelGroups: ChannelGroup[] = Array.from(channelMap.values()).map((g) => {
    const np =
      g.supplyRevenue - g.costAmount - g.commissionAmount - g.cardFeeAmount - g.sellingCostAmount;
    const mr = g.supplyRevenue > 0 ? (np / g.supplyRevenue) * 100 : 0;
    return {
      ...g,
      revenue: Math.round(g.revenue),
      supplyRevenue: Math.round(g.supplyRevenue),
      costAmount: Math.round(g.costAmount),
      commissionAmount: Math.round(g.commissionAmount),
      cardFeeAmount: Math.round(g.cardFeeAmount),
      sellingCostAmount: Math.round(g.sellingCostAmount),
      netProfit: Math.round(np),
      marginRate: Number(mr.toFixed(1)),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // 상품 그룹 마무리
  const productGroups: ProductGroup[] = Array.from(productMap.values()).map((g) => {
    const mr = g.supplyRevenue > 0 ? (g.netProfit / g.supplyRevenue) * 100 : 0;
    return {
      ...g,
      revenue: Math.round(g.revenue),
      supplyRevenue: Math.round(g.supplyRevenue),
      costAmount: Math.round(g.costAmount),
      netProfit: Math.round(g.netProfit),
      marginRate: Number(mr.toFixed(1)),
    };
  });

  // 카테고리 그룹 마무리
  const categoryGroups: CategoryGroup[] = Array.from(categoryMap.values()).map((g) => {
    const mr = g.supplyRevenue > 0 ? (g.netProfit / g.supplyRevenue) * 100 : 0;
    return {
      ...g,
      revenue: Math.round(g.revenue),
      supplyRevenue: Math.round(g.supplyRevenue),
      costAmount: Math.round(g.costAmount),
      commissionAmount: Math.round(g.commissionAmount),
      cardFeeAmount: Math.round(g.cardFeeAmount),
      sellingCostAmount: Math.round(g.sellingCostAmount),
      netProfit: Math.round(g.netProfit),
      marginRate: Number(mr.toFixed(1)),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return { summary, orders: orderRows, channelGroups, productGroups, categoryGroups };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const channelId = searchParams.get("channelId");

  // 기본: 이번 달 1일 ~ 다음 달 1일
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const from = fromParam ? new Date(fromParam) : monthStart;
  const to = toParam ? new Date(toParam) : monthEnd;

  // 직전 동일 길이 기간 (예: 이번 달 → 전월)
  const periodMs = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - periodMs);

  const [current, previous] = await Promise.all([
    aggregate(from, to, channelId && channelId !== "all" ? channelId : null),
    aggregate(prevFrom, prevTo, channelId && channelId !== "all" ? channelId : null),
  ]);

  return NextResponse.json({
    period: { from, to },
    prevPeriod: { from: prevFrom, to: prevTo },
    summary: current.summary,
    prevSummary: previous.summary,
    orders: current.orders,
    channelGroups: current.channelGroups,
    productGroups: current.productGroups,
  });
}
