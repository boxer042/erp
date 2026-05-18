import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 월별 추이 — 최근 12개월의 매출/매출원가/영업이익 (공급가액 기준)

const REVENUE_BEARING_STATUSES = [
  "PREPARING",
  "PREPARING_PACKED",
  "SHIPPED",
  "COMPLETED",
  "RETURN_REQUESTED",
  "RETURN_ACCEPTED",
  "RETURN_PICKING",
  "RETURN_COLLECTED",
  "RETURN_INSPECTED",
  "RETURNED",
  "EXCHANGED",
] as const;

interface MonthlyPoint {
  month: string; // "2026-01"
  netRevenue: number; // 순매출
  costOfGoodsSold: number;
  grossProfit: number;
  operatingIncome: number;
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const monthsParam = searchParams.get("months");
  const months = monthsParam ? Math.min(24, Math.max(1, parseInt(monthsParam))) : 12;

  const now = new Date();
  // 12개월 = 이번 달 포함 과거 11개월
  const firstMonthStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: { in: [...REVENUE_BEARING_STATUSES] },
        orderDate: { gte: firstMonthStart, lt: lastMonthEnd },
      },
      select: {
        orderDate: true,
        status: true,
        paymentStatus: true,
        items: {
          select: {
            quantity: true,
            totalPrice: true,
            refundedAmount: true,
            unitCostSnapshot: true,
            channelCommissionRateSnapshot: true,
            cardFeeRateSnapshot: true,
            sellingCostSnapshot: true,
            product: { select: { taxType: true, taxRate: true } },
            lotConsumptions: { select: { quantity: true, unitCost: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        date: { gte: firstMonthStart, lt: lastMonthEnd },
        recoverable: false,
      },
      select: { date: true, amount: true, isTaxable: true },
    }),
  ]);

  // 월 키 생성
  const monthKeys: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const buckets = new Map<string, MonthlyPoint>();
  for (const k of monthKeys) {
    buckets.set(k, {
      month: k,
      netRevenue: 0,
      costOfGoodsSold: 0,
      grossProfit: 0,
      operatingIncome: 0,
    });
  }

  // 주문 처리
  for (const order of orders) {
    const d = order.orderDate;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(k);
    if (!bucket) continue;

    const isReturned = order.status === "RETURNED";
    const isExchanged = order.status === "EXCHANGED";
    const isSalesCancelled = order.paymentStatus === "SALES_CANCELLED";
    const isFullyDeducted = isReturned || isExchanged || isSalesCancelled;

    for (const item of order.items) {
      const qty = Number(item.quantity);
      const totalPrice = Number(item.totalPrice);
      const refundedAmount = Number(item.refundedAmount);
      // OrderItem.totalPrice / refundedAmount 는 이미 세전(공급가액) — 추가 환산 금지
      const supplyRevenue = totalPrice;
      const supplyRefunded = refundedAmount;

      const refundRatio =
        !isFullyDeducted && refundedAmount > 0 && totalPrice > 0
          ? Math.min(1, refundedAmount / totalPrice)
          : 0;
      const effectiveRatio = 1 - refundRatio;

      // 매출 발생
      bucket.netRevenue += supplyRevenue;
      // 매출 차감
      if (isFullyDeducted) bucket.netRevenue -= supplyRevenue;
      else if (refundedAmount > 0) bucket.netRevenue -= supplyRefunded;

      // 매출원가
      if (item.lotConsumptions.length > 0) {
        for (const lc of item.lotConsumptions) {
          bucket.costOfGoodsSold += Number(lc.quantity) * Number(lc.unitCost);
        }
      } else if (!isFullyDeducted && item.unitCostSnapshot != null) {
        bucket.costOfGoodsSold += Number(item.unitCostSnapshot) * qty * effectiveRatio;
      }

      // 영업이익 = 매출 - 원가 - 수수료/판매비용 (판관비는 expense 에서)
      if (!isFullyDeducted) {
        const commRate = item.channelCommissionRateSnapshot
          ? Number(item.channelCommissionRateSnapshot)
          : 0;
        const cardRate = item.cardFeeRateSnapshot
          ? Number(item.cardFeeRateSnapshot)
          : 0;
        const selling = item.sellingCostSnapshot
          ? Number(item.sellingCostSnapshot) * qty
          : 0;
        bucket.operatingIncome -=
          (totalPrice * commRate + totalPrice * cardRate + selling) * effectiveRatio;
      }
    }
  }

  // Expense 차감
  for (const e of expenses) {
    const k = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(k);
    if (!bucket) continue;
    const raw = Number(e.amount);
    const net = e.isTaxable ? raw / 1.1 : raw;
    bucket.operatingIncome -= net;
  }

  // 최종 계산
  const points: MonthlyPoint[] = monthKeys.map((k) => {
    const b = buckets.get(k)!;
    const grossProfit = b.netRevenue - b.costOfGoodsSold;
    const operatingIncome = grossProfit + b.operatingIncome; // 차감 누적 → 더하기
    return {
      month: k,
      netRevenue: Math.round(b.netRevenue),
      costOfGoodsSold: Math.round(b.costOfGoodsSold),
      grossProfit: Math.round(grossProfit),
      operatingIncome: Math.round(operatingIncome),
    };
  });

  return NextResponse.json({ points });
}
