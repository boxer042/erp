import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 부가세 신고 자료 — 분기별 매출/매입 부가세 상세
// 세무사 전달용 / 홈택스 신고용 참고 자료.
//
// 매출 부가세 (예수금):
//   - 활성 매출의 Order.taxAmount 합
//   - 전액 차감 (RETURNED/EXCHANGED/SALES_CANCELLED) 은 제외
//   - 부분환불은 OrderItem.refundedAmount × taxRate 차감 (과세 상품만)
//
// 매입 부가세 (대급금):
//   - 입고 품목 매입세액 (IncomingItem.totalPrice × 0.1, supplierProduct.isTaxable=true)
//   - 입고 배송비 매입세액 (shippingCost / 11, shippingIsTaxable=true)
//   - 입고 비용 매입세액 (IncomingCost perUnit=true, isTaxable=true)
//   - 경비 매입세액 (Expense.amount / 11, isTaxable=true)
//   - 입고 반품 차감

interface CustomerVatRow {
  customerId: string;
  customerName: string;
  businessNumber: string | null;
  type: "BUSINESS" | "INDIVIDUAL";
  supplyAmount: number;
  vatAmount: number;
}

interface SupplierVatRow {
  supplierId: string;
  supplierName: string;
  businessNumber: string | null;
  supplyAmount: number;
  vatAmount: number;
}

interface ExpenseVatRow {
  category: string;
  supplyAmount: number;
  vatAmount: number;
}

interface VatFilingReport {
  period: { from: Date; to: Date; label: string };
  summary: {
    outputVatTotal: number;
    inputVatTotal: number;
    estimatedPayable: number;
  };
  sales: {
    activeSupply: number;
    activeVat: number;
    refundSupply: number;
    refundVat: number;
    exchangeSupply: number;
    exchangeVat: number;
    cancelSupply: number;
    cancelVat: number;
    partialRefundSupply: number;
    partialRefundVat: number;
    netVat: number;
    businessTotal: { supplyAmount: number; vatAmount: number; count: number };
    individualTotal: { supplyAmount: number; vatAmount: number; count: number };
    byCustomer: CustomerVatRow[];
  };
  purchases: {
    incomingSupply: number;
    incomingVat: number;
    incomingCostVat: number;
    shippingVat: number;
    returnVat: number;
    expenseSupply: number;
    expenseVat: number;
    netVat: number;
    bySupplier: SupplierVatRow[];
    byExpense: ExpenseVatRow[];
  };
  deferredVat: {
    // 결제 종류별 집계 — 부가세 후납 추적
    receipts: { mixed: number; supplyOnly: number; vatOnly: number };
    payments: { mixed: number; supplyOnly: number; vatOnly: number };
  };
}

function getQuarterRange(year: number, quarter: number): { from: Date; to: Date; label: string } {
  const qStart = (quarter - 1) * 3;
  return {
    from: new Date(year, qStart, 1),
    to: new Date(year, qStart + 3, 1),
    label: `${year}년 ${quarter}분기`,
  };
}

function getCurrentQuarter(now: Date) {
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const quarterParam = searchParams.get("quarter");

  const now = new Date();
  const { year: curYear, quarter: curQuarter } = getCurrentQuarter(now);
  const year = yearParam ? parseInt(yearParam) : curYear;
  const quarter = quarterParam ? parseInt(quarterParam) : curQuarter;
  const { from, to, label } = getQuarterRange(year, quarter);

  const [orders, incomings, supplierReturns, expenses, customerPayments, supplierPayments] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: {
          in: [
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
          ],
        },
        orderDate: { gte: from, lt: to },
      },
      select: {
        taxAmount: true,
        subtotalAmount: true,
        status: true,
        paymentStatus: true,
        customer: {
          select: { id: true, name: true, businessNumber: true, type: true },
        },
        items: {
          select: {
            totalPrice: true,
            refundedAmount: true,
            product: { select: { taxType: true, taxRate: true } },
          },
        },
      },
    }),
    prisma.incoming.findMany({
      where: {
        status: "CONFIRMED",
        incomingDate: { gte: from, lt: to },
      },
      select: {
        shippingCost: true,
        shippingIsTaxable: true,
        supplier: { select: { id: true, name: true, businessNumber: true } },
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
    prisma.supplierReturn.findMany({
      where: {
        status: "CONFIRMED",
        returnDate: { gte: from, lt: to },
      },
      select: {
        supplier: { select: { id: true, name: true, businessNumber: true } },
        items: {
          select: {
            totalPrice: true,
            supplierProduct: { select: { isTaxable: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { date: { gte: from, lt: to }, isTaxable: true, recoverable: false },
      select: { category: true, amount: true },
    }),
    // 부가세 후납 추적 — 결제 종류별 집계
    prisma.customerPayment.groupBy({
      by: ["kind"],
      where: { paymentDate: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["kind"],
      where: { paymentDate: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
  ]);

  // ── 매출 부가세 ──────────────────────────────────────────
  let activeSupply = 0;
  let activeVat = 0;
  let refundSupply = 0;
  let refundVat = 0;
  let exchangeSupply = 0;
  let exchangeVat = 0;
  let cancelSupply = 0;
  let cancelVat = 0;
  let partialRefundSupply = 0;
  let partialRefundVat = 0;

  const customerMap = new Map<string, CustomerVatRow>();
  const NO_CUSTOMER_KEY = "__no_customer__";

  for (const order of orders) {
    const isReturned = order.status === "RETURNED";
    const isExchanged = order.status === "EXCHANGED";
    const isSalesCancelled = order.paymentStatus === "SALES_CANCELLED";
    const isFullyDeducted = isReturned || isExchanged || isSalesCancelled;

    const supply = Number(order.subtotalAmount);
    const vat = Number(order.taxAmount);

    if (isFullyDeducted) {
      if (isSalesCancelled) {
        cancelSupply += supply;
        cancelVat += vat;
      } else if (isReturned) {
        refundSupply += supply;
        refundVat += vat;
      } else if (isExchanged) {
        exchangeSupply += supply;
        exchangeVat += vat;
      }
      continue;
    }

    activeSupply += supply;
    activeVat += vat;

    // 부분환불 차감
    let orderPartialSupply = 0;
    let orderPartialVat = 0;
    for (const item of order.items) {
      const refundedAmount = Number(item.refundedAmount);
      if (refundedAmount <= 0) continue;
      const taxRate =
        item.product?.taxType === "TAXABLE" ? Number(item.product.taxRate) : 0;
      // OrderItem.refundedAmount 는 이미 세전(공급가액) — 추가 환산 금지
      const supplyRefunded = refundedAmount;
      orderPartialSupply += supplyRefunded;
      if (taxRate > 0) orderPartialVat += supplyRefunded * taxRate;
    }
    partialRefundSupply += orderPartialSupply;
    partialRefundVat += orderPartialVat;

    // 거래처별 분류 (활성 매출 기준 + 부분환불 차감 후)
    const key = order.customer?.id ?? NO_CUSTOMER_KEY;
    const existing = customerMap.get(key);
    const netSupply = supply - orderPartialSupply;
    const netVat = vat - orderPartialVat;
    if (existing) {
      existing.supplyAmount += netSupply;
      existing.vatAmount += netVat;
    } else {
      customerMap.set(key, {
        customerId: order.customer?.id ?? "",
        customerName: order.customer?.name ?? "(미등록 고객)",
        businessNumber: order.customer?.businessNumber ?? null,
        type: order.customer?.type === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL",
        supplyAmount: netSupply,
        vatAmount: netVat,
      });
    }
  }

  const netOutputVat = activeVat - partialRefundVat;
  const byCustomer = Array.from(customerMap.values())
    .map((r) => ({
      ...r,
      supplyAmount: Math.round(r.supplyAmount),
      vatAmount: Math.round(r.vatAmount),
    }))
    .sort((a, b) => b.vatAmount - a.vatAmount);

  let businessSupply = 0;
  let businessVat = 0;
  let businessCount = 0;
  let individualSupply = 0;
  let individualVat = 0;
  let individualCount = 0;
  for (const c of byCustomer) {
    if (c.type === "BUSINESS") {
      businessSupply += c.supplyAmount;
      businessVat += c.vatAmount;
      businessCount += 1;
    } else {
      individualSupply += c.supplyAmount;
      individualVat += c.vatAmount;
      individualCount += 1;
    }
  }

  // ── 매입 부가세 ──────────────────────────────────────────
  let incomingSupply = 0;
  let incomingVat = 0;
  let incomingCostVat = 0;
  let shippingVat = 0;
  let returnVat = 0;

  const supplierMap = new Map<string, SupplierVatRow>();

  for (const inc of incomings) {
    let supplierSupply = 0;
    let supplierVat = 0;
    for (const item of inc.items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const totalPrice = Number(item.totalPrice);
      if (item.supplierProduct.isTaxable) {
        const vat = totalPrice * 0.1;
        incomingSupply += totalPrice;
        incomingVat += vat;
        supplierSupply += totalPrice;
        supplierVat += vat;
      }
      for (const cost of item.supplierProduct.incomingCosts) {
        const raw =
          cost.costType === "FIXED"
            ? Number(cost.value)
            : (unitPrice * Number(cost.value)) / 100;
        const vat = cost.costType === "FIXED" ? raw / 11 : raw * 0.1;
        const totalVat = vat * qty;
        incomingCostVat += totalVat;
        supplierVat += totalVat;
      }
    }
    if (inc.shippingIsTaxable && Number(inc.shippingCost) > 0) {
      const vat = Number(inc.shippingCost) / 11;
      shippingVat += vat;
      supplierVat += vat;
    }

    const key = inc.supplier.id;
    const existing = supplierMap.get(key);
    if (existing) {
      existing.supplyAmount += supplierSupply;
      existing.vatAmount += supplierVat;
    } else {
      supplierMap.set(key, {
        supplierId: inc.supplier.id,
        supplierName: inc.supplier.name,
        businessNumber: inc.supplier.businessNumber,
        supplyAmount: supplierSupply,
        vatAmount: supplierVat,
      });
    }
  }

  for (const ret of supplierReturns) {
    let supplierReturnSupply = 0;
    let supplierReturnVat = 0;
    for (const item of ret.items) {
      if (item.supplierProduct.isTaxable) {
        const supply = Number(item.totalPrice);
        const vat = supply * 0.1;
        returnVat += vat;
        supplierReturnSupply += supply;
        supplierReturnVat += vat;
      }
    }
    const key = ret.supplier.id;
    const existing = supplierMap.get(key);
    if (existing) {
      existing.supplyAmount -= supplierReturnSupply;
      existing.vatAmount -= supplierReturnVat;
    } else if (supplierReturnSupply > 0 || supplierReturnVat > 0) {
      supplierMap.set(key, {
        supplierId: ret.supplier.id,
        supplierName: ret.supplier.name,
        businessNumber: ret.supplier.businessNumber,
        supplyAmount: -supplierReturnSupply,
        vatAmount: -supplierReturnVat,
      });
    }
  }

  const bySupplier = Array.from(supplierMap.values())
    .map((r) => ({
      ...r,
      supplyAmount: Math.round(r.supplyAmount),
      vatAmount: Math.round(r.vatAmount),
    }))
    .sort((a, b) => b.vatAmount - a.vatAmount);

  // Expense 카테고리별
  const expenseMap = new Map<string, ExpenseVatRow>();
  let expenseSupply = 0;
  let expenseVat = 0;
  for (const e of expenses) {
    const raw = Number(e.amount);
    const net = raw / 1.1;
    const vat = raw - net;
    expenseSupply += net;
    expenseVat += vat;
    const existing = expenseMap.get(e.category);
    if (existing) {
      existing.supplyAmount += net;
      existing.vatAmount += vat;
    } else {
      expenseMap.set(e.category, {
        category: e.category,
        supplyAmount: net,
        vatAmount: vat,
      });
    }
  }
  const byExpense = Array.from(expenseMap.values())
    .map((r) => ({
      ...r,
      supplyAmount: Math.round(r.supplyAmount),
      vatAmount: Math.round(r.vatAmount),
    }))
    .sort((a, b) => b.vatAmount - a.vatAmount);

  const inputVatTotal =
    incomingVat + incomingCostVat + shippingVat + expenseVat - returnVat;

  // 결제 종류별 집계 — 부가세 후납 추적
  const sumByKind = (
    rows: { kind: string; _sum: { amount: unknown } }[],
  ) => {
    const result = { mixed: 0, supplyOnly: 0, vatOnly: 0 };
    for (const r of rows) {
      const amt = Number(r._sum.amount ?? 0);
      if (r.kind === "SUPPLY_ONLY") result.supplyOnly += amt;
      else if (r.kind === "VAT_ONLY") result.vatOnly += amt;
      else result.mixed += amt;
    }
    return {
      mixed: Math.round(result.mixed),
      supplyOnly: Math.round(result.supplyOnly),
      vatOnly: Math.round(result.vatOnly),
    };
  };

  const report: VatFilingReport = {
    period: { from, to, label },
    summary: {
      outputVatTotal: Math.round(netOutputVat),
      inputVatTotal: Math.round(inputVatTotal),
      estimatedPayable: Math.round(netOutputVat - inputVatTotal),
    },
    sales: {
      activeSupply: Math.round(activeSupply),
      activeVat: Math.round(activeVat),
      refundSupply: Math.round(refundSupply),
      refundVat: Math.round(refundVat),
      exchangeSupply: Math.round(exchangeSupply),
      exchangeVat: Math.round(exchangeVat),
      cancelSupply: Math.round(cancelSupply),
      cancelVat: Math.round(cancelVat),
      partialRefundSupply: Math.round(partialRefundSupply),
      partialRefundVat: Math.round(partialRefundVat),
      netVat: Math.round(netOutputVat),
      businessTotal: {
        supplyAmount: Math.round(businessSupply),
        vatAmount: Math.round(businessVat),
        count: businessCount,
      },
      individualTotal: {
        supplyAmount: Math.round(individualSupply),
        vatAmount: Math.round(individualVat),
        count: individualCount,
      },
      byCustomer,
    },
    purchases: {
      incomingSupply: Math.round(incomingSupply),
      incomingVat: Math.round(incomingVat),
      incomingCostVat: Math.round(incomingCostVat),
      shippingVat: Math.round(shippingVat),
      returnVat: Math.round(returnVat),
      expenseSupply: Math.round(expenseSupply),
      expenseVat: Math.round(expenseVat),
      netVat: Math.round(inputVatTotal),
      bySupplier,
      byExpense,
    },
    deferredVat: {
      receipts: sumByKind(customerPayments),
      payments: sumByKind(supplierPayments),
    },
  };

  return NextResponse.json(report);
}
