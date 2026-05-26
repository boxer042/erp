import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 손익계산서 — 공급가액 기준 매출·매출원가·판관비·영업이익 집계 (V3: 총액주의 + 부분환불 비례차감)
//
// V3 정책 (회계 정석):
//   - 매출은 발생 시점 기준 (재고 차감되어 매출 인식된 모든 주문)
//   - 환불·교환·매출취소는 별도 "매출 차감" 라인으로 분리 표시
//   - 부분 환불은 OrderItem.refundedAmount 비율로 수수료/판매비용/원가까지 일관 차감
//   - -EX 새 주문 제외 정책 제거 (원본 EXCHANGED 차감과 짝맞춤)
//
// 매출 발생 status:
//   PREPARING / PREPARING_PACKED / SHIPPED / COMPLETED (정상)
//   RETURN_REQUESTED~RETURN_INSPECTED (반품 진행중 — 매출은 발생함)
//   RETURNED / EXCHANGED (반품·교환 완료 — 매출 발생 + 동시 차감)
//
// 매출 차감 4분류:
//   - refund:    status = RETURNED
//   - exchange:  status = EXCHANGED
//   - cancel:    paymentStatus = SALES_CANCELLED (외상 반품)
//   - partial:   활성 주문의 Σ OrderItem.refundedAmount (공급가액 환산)
//
// 매출원가 (V3 — 부분환불 비례 차감):
//   - lotConsumptions 있음: 그대로 사용 (시스템이 부분환불 시 LotConsumption 도 갱신한다고 가정)
//   - lotConsumptions 없고 unitCostSnapshot 있음: 부분환불 비율(1 - refundRatio) 적용
//   - 전액 차감(RETURNED/EXCHANGED/SALES_CANCELLED): lotConsumptions 만 (복원된 부분은 0)
//
// 수수료/판매비용 (V3 — 부분환불 비례 차감):
//   - 전액 차감 주문: 0 (매출 발생 안 한 효과)
//   - 부분환불: (1 - refundRatio) 비율 적용
//   - 정상: 100% 그대로

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

interface RevenueBreakdown {
  product: number;
  repair: number;
  rental: number;
  total: number; // 총 매출액 (차감 전)
}

interface DeductionBreakdown {
  refund: number; // RETURNED
  exchange: number; // EXCHANGED
  cancel: number; // paymentStatus=SALES_CANCELLED
  partial: number; // 부분 환불
  total: number; // 매출 차감 합계
}

interface OpexBreakdown {
  channelCommission: number;
  cardFee: number;
  sellingCost: number;
  categories: { category: string; amount: number; isTaxable?: boolean }[];
  generalTotal: number;
  total: number;
}

interface VatStatus {
  outputVat: number;
  inputVat: number;
  estimatedPayment: number;
}

interface PeriodReport {
  revenue: RevenueBreakdown;
  deductions: DeductionBreakdown;
  netRevenue: number; // 순 매출액
  costOfGoodsSold: number;
  grossProfit: number; // 순매출 − 매출원가
  operatingExpenses: OpexBreakdown;
  operatingIncome: number;
  vat: VatStatus;
  missingCostCount: number;
}

async function aggregatePeriod(from: Date, to: Date): Promise<PeriodReport> {
  const [orders, shippingBorneRows, incomings, supplierReturns, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: { in: [...REVENUE_BEARING_STATUSES] },
        orderDate: { gte: from, lt: to },
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        repairTicketId: true,
        rentalId: true,
        taxAmount: true,
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
    // 매장 부담 배송 원가 (Order.shippingCostBorne, 세전 net) — 별도 Expense 가 아니므로
    // 일반 경비 합계에 SHIPPING 카테고리로 합산 + 매입세액 가산 (전부 과세 가정).
    // status=CANCELLED 만 제외 (취소 전 이미 송장 발행/지급된 경우 그대로 비용).
    prisma.order.findMany({
      where: {
        shippingCostBorne: { gt: 0 },
        status: { not: "CANCELLED" },
        orderDate: { gte: from, lt: to },
      },
      select: { shippingCostBorne: true },
    }),
    // 입고 — taxAmount 필드는 저장 안 되므로 items.totalPrice × 0.1 로 계산
    // 추가로 SupplierProduct.incomingCosts (perUnit=true) 의 매입세액도 가산
    prisma.incoming.findMany({
      where: {
        status: "CONFIRMED",
        incomingDate: { gte: from, lt: to },
      },
      select: {
        shippingCost: true,
        shippingIsTaxable: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            supplierProduct: {
              select: {
                isTaxable: true,
                incomingCosts: {
                  where: { isActive: true, isTaxable: true, perUnit: true },
                  select: { costType: true, value: true },
                },
              },
            },
          },
        },
      },
    }),
    // 입고 반품 — 매입세액 차감
    prisma.supplierReturn.findMany({
      where: {
        status: "CONFIRMED",
        returnDate: { gte: from, lt: to },
      },
      select: {
        items: {
          select: {
            totalPrice: true,
            supplierProduct: { select: { isTaxable: true } },
          },
        },
      },
    }),
    // 입고 운임(referenceType=INCOMING, category=SHIPPING)은 매출원가에 베이크되어
    // 있으므로 영업비용에서 중복 차감되지 않도록 제외.
    prisma.expense.findMany({
      where: {
        date: { gte: from, lt: to },
        recoverable: false,
        NOT: { category: "SHIPPING", referenceType: "INCOMING" },
      },
      select: { category: true, amount: true, isTaxable: true },
    }),
  ]);

  const revenue: RevenueBreakdown = { product: 0, repair: 0, rental: 0, total: 0 };
  const deductions: DeductionBreakdown = {
    refund: 0,
    exchange: 0,
    cancel: 0,
    partial: 0,
    total: 0,
  };
  let costOfGoodsSold = 0;
  let channelCommission = 0;
  let cardFee = 0;
  let sellingCostTotal = 0;
  let missingCostCount = 0;
  let outputVat = 0;

  for (const order of orders) {
    const isRepair = order.repairTicketId !== null;
    const isRental = order.rentalId !== null;

    // 매출 차감 분류
    const isReturned = order.status === "RETURNED";
    const isExchanged = order.status === "EXCHANGED";
    const isSalesCancelled = order.paymentStatus === "SALES_CANCELLED";
    const isFullyDeducted = isReturned || isExchanged || isSalesCancelled;

    // 부가세 예수금 — 전액 차감 주문은 제외 (부분환불은 아래 루프에서 차감)
    if (!isFullyDeducted) {
      outputVat += Number(order.taxAmount);
    }

    for (const item of order.items) {
      const qty = Number(item.quantity);
      const totalPrice = Number(item.totalPrice);
      const refundedAmount = Number(item.refundedAmount);
      const taxRate =
        item.product?.taxType === "TAXABLE" ? Number(item.product.taxRate) : 0;
      // OrderItem.totalPrice / refundedAmount 는 이미 세전(공급가액) 기준 저장값.
      // 추가 환산(÷1.1) 금지 — 이중 차감됨.
      const supplyRevenue = totalPrice;
      const supplyRefunded = refundedAmount;

      // 부분환불 비율 (활성 주문에만 적용 — 0~1 사이)
      const refundRatio =
        !isFullyDeducted && refundedAmount > 0 && totalPrice > 0
          ? Math.min(1, refundedAmount / totalPrice)
          : 0;
      const effectiveRatio = 1 - refundRatio; // 환불 안 된 비율

      // 매출 (총액 — 발생 시점 기준)
      if (isRepair) revenue.repair += supplyRevenue;
      else if (isRental) revenue.rental += supplyRevenue;
      else revenue.product += supplyRevenue;

      // 매출 차감 분류
      if (isFullyDeducted) {
        if (isSalesCancelled) deductions.cancel += supplyRevenue;
        else if (isReturned) deductions.refund += supplyRevenue;
        else if (isExchanged) deductions.exchange += supplyRevenue;
      } else if (refundedAmount > 0) {
        deductions.partial += supplyRefunded;
        // 부분환불 부가세 차감 — 과세 상품만
        if (taxRate > 0) {
          outputVat -= supplyRefunded * taxRate;
        }
      }

      // 매출원가
      if (item.lotConsumptions.length > 0) {
        // lotConsumptions 는 시스템이 부분환불 시 LotConsumption 도 함께 갱신한다고 가정
        for (const lc of item.lotConsumptions) {
          costOfGoodsSold += Number(lc.quantity) * Number(lc.unitCost);
        }
      } else if (!isFullyDeducted && item.unitCostSnapshot != null) {
        // unitCostSnapshot fallback — 부분환불 비율 적용 (스냅샷은 주문 시점이라 환불 미반영)
        costOfGoodsSold += Number(item.unitCostSnapshot) * qty * effectiveRatio;
      } else if (!isFullyDeducted && item.product) {
        missingCostCount += 1;
      }
      // isFullyDeducted 인데 lotConsumptions 도 없으면: 복원된 상태 → 원가 0 (정합성)

      // 수수료·판매비용 — 활성 주문에 부분환불 비율 적용, 전액 차감 주문은 0
      if (!isFullyDeducted) {
        const commRate = item.channelCommissionRateSnapshot
          ? Number(item.channelCommissionRateSnapshot)
          : 0;
        const cardRate = item.cardFeeRateSnapshot
          ? Number(item.cardFeeRateSnapshot)
          : 0;
        channelCommission += totalPrice * commRate * effectiveRatio;
        cardFee += totalPrice * cardRate * effectiveRatio;
        sellingCostTotal +=
          (item.sellingCostSnapshot ? Number(item.sellingCostSnapshot) * qty : 0) *
          effectiveRatio;
      }
    }
  }

  revenue.total = revenue.product + revenue.repair + revenue.rental;
  deductions.total =
    deductions.refund + deductions.exchange + deductions.cancel + deductions.partial;
  const netRevenue = revenue.total - deductions.total;

  // 일반 경비
  const opexMap = new Map<string, { amount: number; taxableSum: number }>();
  let inputVatFromExpenses = 0;
  for (const e of expenses) {
    const raw = Number(e.amount);
    const net = e.isTaxable ? raw / 1.1 : raw;
    if (e.isTaxable) inputVatFromExpenses += raw - net;
    const prev = opexMap.get(e.category) ?? { amount: 0, taxableSum: 0 };
    prev.amount += net;
    if (e.isTaxable) prev.taxableSum += net;
    opexMap.set(e.category, prev);
  }
  // 매장 부담 배송 원가 — 이미 net 저장이라 환산 불필요. 과세 가정 → 매입세액 가산.
  for (const o of shippingBorneRows) {
    const net = Number(o.shippingCostBorne);
    if (net <= 0) continue;
    inputVatFromExpenses += net * 0.1;
    const prev = opexMap.get("SHIPPING") ?? { amount: 0, taxableSum: 0 };
    prev.amount += net;
    prev.taxableSum += net;
    opexMap.set("SHIPPING", prev);
  }
  const categories = Array.from(opexMap.entries())
    .map(([category, v]) => ({
      category,
      amount: Math.round(v.amount),
      isTaxable: v.taxableSum > v.amount / 2,
    }))
    .sort((a, b) => b.amount - a.amount);

  const generalTotal = categories.reduce((s, c) => s + c.amount, 0);
  const opexTotal = generalTotal + channelCommission + cardFee + sellingCostTotal;

  // 매입 부가세 — Incoming.taxAmount 필드는 저장 안 되므로 items.totalPrice × 0.1 로 계산
  // 추가: SupplierProduct.incomingCosts (perUnit=true, isTaxable=true) 의 매입세액도 가산
  let inputVatFromIncoming = 0;
  for (const inc of incomings) {
    for (const item of inc.items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (item.supplierProduct.isTaxable) {
        inputVatFromIncoming += Number(item.totalPrice) * 0.1;
      }
      for (const cost of item.supplierProduct.incomingCosts) {
        const raw =
          cost.costType === "FIXED"
            ? Number(cost.value)
            : (unitPrice * Number(cost.value)) / 100;
        const vat = cost.costType === "FIXED" ? raw / 11 : raw * 0.1;
        inputVatFromIncoming += vat * qty;
      }
    }
    if (inc.shippingIsTaxable && Number(inc.shippingCost) > 0) {
      inputVatFromIncoming += Number(inc.shippingCost) / 11;
    }
  }
  // 입고 반품 — 매입세액 차감
  let inputVatReturned = 0;
  for (const ret of supplierReturns) {
    for (const item of ret.items) {
      if (item.supplierProduct.isTaxable) {
        inputVatReturned += Number(item.totalPrice) * 0.1;
      }
    }
  }
  const inputVat = inputVatFromIncoming - inputVatReturned + inputVatFromExpenses;

  const grossProfit = netRevenue - costOfGoodsSold;
  const operatingIncome = grossProfit - opexTotal;

  return {
    revenue: {
      product: Math.round(revenue.product),
      repair: Math.round(revenue.repair),
      rental: Math.round(revenue.rental),
      total: Math.round(revenue.total),
    },
    deductions: {
      refund: Math.round(deductions.refund),
      exchange: Math.round(deductions.exchange),
      cancel: Math.round(deductions.cancel),
      partial: Math.round(deductions.partial),
      total: Math.round(deductions.total),
    },
    netRevenue: Math.round(netRevenue),
    costOfGoodsSold: Math.round(costOfGoodsSold),
    grossProfit: Math.round(grossProfit),
    operatingExpenses: {
      channelCommission: Math.round(channelCommission),
      cardFee: Math.round(cardFee),
      sellingCost: Math.round(sellingCostTotal),
      categories,
      generalTotal: Math.round(generalTotal),
      total: Math.round(opexTotal),
    },
    operatingIncome: Math.round(operatingIncome),
    vat: {
      outputVat: Math.round(outputVat),
      inputVat: Math.round(inputVat),
      estimatedPayment: Math.round(outputVat - inputVat),
    },
    missingCostCount,
  };
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const from = fromParam ? new Date(fromParam) : monthStart;
  const to = toParam ? new Date(toParam) : monthEnd;

  const periodMs = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - periodMs);

  const [current, previous] = await Promise.all([
    aggregatePeriod(from, to),
    aggregatePeriod(prevFrom, prevTo),
  ]);

  return NextResponse.json({
    period: { from, to },
    prevPeriod: { from: prevFrom, to: prevTo },
    current,
    previous,
  });
}
