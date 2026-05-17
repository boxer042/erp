import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 재무상태표 (Balance Sheet) — 특정 시점의 자산·부채·자본 잔량
//
// 시스템 데이터만으로 만들 수 있는 "약식 재무상태표".
// 회계 모듈 부재로 현금/예금/비품/감가상각/자본금/이익잉여금 은 보강 영역.
//
// 자산:
//   - 매출채권:     CustomerLedger 의 고객별 최근 row.balance 합 (양수만)
//   - 재고자산:     InventoryLot.remainingQty × unitCost (현재 시점)
//   - 부가세대급금: 이번 분기 시작 ~ asOf 의 Incoming.taxAmount + 과세 Expense × 0.1/1.1
//
// 부채:
//   - 매입채무:     SupplierLedger 의 거래처별 최근 row.balance 합 (양수만)
//   - 부가세예수금: 이번 분기 시작 ~ asOf 의 Order.taxAmount
//
// 자본:
//   - 순자산 = 자산 - 부채  (검산식 자동 균형, 회계 모듈 없으니 단일 표시)
//
// 참고: 부가세 자산/부채는 "신고 안 된 분" 만 표시되어야 정확하지만 신고 기록이 없어서
// 분기 단위 누적으로 추정. 신고·납부 후엔 운영자가 인지 차원에서만 사용.

interface ManualEntry {
  id: string;
  category: string;
  label: string;
  amount: number;
  memo: string | null;
}

interface AssetBreakdown {
  receivables: number;
  inventory: number;
  inputVat: number;
  cash: number; // 수기 — 현금·예금
  equipment: number; // 수기 — 비품·설비
  otherAsset: number; // 수기 — 기타 자산
  total: number;
}

interface LiabilityBreakdown {
  payables: number;
  outputVat: number;
  loan: number; // 수기 — 차입금
  otherLiability: number; // 수기 — 기타 부채
  total: number;
}

interface BalanceSheet {
  asOf: Date;
  vatPeriodStart: Date;
  assets: AssetBreakdown;
  liabilities: LiabilityBreakdown;
  equity: {
    netAssets: number; // 자산 - 부채
    capital: number; // 수기 — 자본금
    retainedEarnings: number; // 수기 — 이익잉여금 (전기 누적)
    impliedNetIncome: number; // netAssets - capital - retainedEarnings (당기순이익 추정)
  };
  manualEntries: ManualEntry[];
  meta: {
    customerAdvances: number; // 선수금 (음수 잔액)
    supplierAdvances: number; // 선급금 (음수 잔액)
  };
}

function getCurrentQuarterStart(now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const qStart = Math.floor(m / 3) * 3;
  return new Date(y, qStart, 1);
}

async function aggregate(asOf: Date, vatPeriodStart: Date): Promise<BalanceSheet> {
  const [
    customerLedgerAll,
    supplierLedgerAll,
    lots,
    incomings,
    supplierReturns,
    orders,
    expenses,
    manualEntriesRaw,
  ] = await Promise.all([
    // 모든 고객 ledger (asOf 까지) — customerId 별 첫 번째 row 가 최신
    prisma.customerLedger.findMany({
      where: { date: { lte: asOf } },
      orderBy: [{ customerId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      select: { customerId: true, balance: true },
    }),
    prisma.supplierLedger.findMany({
      where: { date: { lte: asOf } },
      orderBy: [{ supplierId: "asc" }, { date: "desc" }, { createdAt: "desc" }],
      select: { supplierId: true, balance: true },
    }),
    prisma.inventoryLot.findMany({
      where: { remainingQty: { gt: 0 } },
      select: { remainingQty: true, unitCost: true },
    }),
    // 입고 — taxAmount 필드는 저장 안 되므로 items.totalPrice × 0.1 로 계산
    // 추가로 SupplierProduct.incomingCosts (perUnit=true) 의 매입세액도 가산
    prisma.incoming.findMany({
      where: {
        status: "CONFIRMED",
        incomingDate: { gte: vatPeriodStart, lte: asOf },
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
        returnDate: { gte: vatPeriodStart, lte: asOf },
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
    // 주문 — 매출 부가세. RETURNED/EXCHANGED/SALES_CANCELLED 는 차감, 부분환불도 비례 차감
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
        orderDate: { gte: vatPeriodStart, lte: asOf },
      },
      select: {
        taxAmount: true,
        status: true,
        paymentStatus: true,
        items: {
          select: {
            refundedAmount: true,
            product: { select: { taxType: true, taxRate: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        date: { gte: vatPeriodStart, lte: asOf },
        isTaxable: true,
        recoverable: false,
      },
      select: { amount: true },
    }),
    prisma.manualBalanceEntry.findMany({
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // 수기 항목 — 카테고리별 합산
  const manualEntries: ManualEntry[] = manualEntriesRaw.map((e) => ({
    id: e.id,
    category: e.category,
    label: e.label,
    amount: Number(e.amount),
    memo: e.memo,
  }));
  let manualCash = 0;
  let manualEquipment = 0;
  let manualOtherAsset = 0;
  let manualLoan = 0;
  let manualOtherLiability = 0;
  let manualCapital = 0;
  let manualRetainedEarnings = 0;
  for (const e of manualEntries) {
    switch (e.category) {
      case "CASH":
        manualCash += e.amount;
        break;
      case "EQUIPMENT":
        manualEquipment += e.amount;
        break;
      case "OTHER_ASSET":
        manualOtherAsset += e.amount;
        break;
      case "LOAN":
        manualLoan += e.amount;
        break;
      case "OTHER_LIABILITY":
        manualOtherLiability += e.amount;
        break;
      case "CAPITAL":
        manualCapital += e.amount;
        break;
      case "RETAINED_EARNINGS":
        manualRetainedEarnings += e.amount;
        break;
    }
  }

  // 매출채권 / 선수금 — customerId 별 첫 번째 row (orderBy DESC 했으니 최신)
  let receivables = 0;
  let customerAdvances = 0;
  const seenCustomers = new Set<string>();
  for (const row of customerLedgerAll) {
    if (seenCustomers.has(row.customerId)) continue;
    seenCustomers.add(row.customerId);
    const b = Number(row.balance);
    if (b > 0) receivables += b;
    else if (b < 0) customerAdvances += Math.abs(b);
  }

  // 매입채무 / 선급금
  let payables = 0;
  let supplierAdvances = 0;
  const seenSuppliers = new Set<string>();
  for (const row of supplierLedgerAll) {
    if (seenSuppliers.has(row.supplierId)) continue;
    seenSuppliers.add(row.supplierId);
    const b = Number(row.balance);
    if (b > 0) payables += b;
    else if (b < 0) supplierAdvances += Math.abs(b);
  }

  // 재고
  const inventory = lots.reduce(
    (s, l) => s + Number(l.remainingQty) * Number(l.unitCost),
    0,
  );

  // 부가세 자산 (매입 부가세 누적 — 신고 안 된 분 가정)
  // ⚠️ Incoming.taxAmount 필드는 저장되지 않으므로 items.totalPrice × 0.1 로 계산
  // 추가: SupplierProduct.incomingCosts (perUnit=true, isTaxable=true) 의 매입세액도 가산
  //       FIXED 비용은 VAT 포함 입력이라 /11, PERCENTAGE 는 공급가 비율이라 ×0.1
  let inputVatFromIncoming = 0;
  for (const inc of incomings) {
    for (const item of inc.items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (item.supplierProduct.isTaxable) {
        inputVatFromIncoming += Number(item.totalPrice) * 0.1;
      }
      // IncomingCost 매입세액
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
  // 입고 반품 — 매입세액 차감 (반품 확정 시 환급되어야 할 매입세액)
  let inputVatReturned = 0;
  for (const ret of supplierReturns) {
    for (const item of ret.items) {
      if (item.supplierProduct.isTaxable) {
        inputVatReturned += Number(item.totalPrice) * 0.1;
      }
    }
  }
  // 과세 Expense 의 매입세액 (= raw - raw/1.1 = raw × 1/11)
  const inputVatFromExpenses = expenses.reduce(
    (s, e) => s + Number(e.amount) / 11,
    0,
  );
  const inputVat = inputVatFromIncoming - inputVatReturned + inputVatFromExpenses;

  // 부가세 부채 (매출 부가세 누적)
  // - RETURNED/EXCHANGED/SALES_CANCELLED 는 매출 부가세에서 제외 (환불 시 부가세도 돌려줌)
  // - 활성 주문의 부분환불 (OrderItem.refundedAmount) 은 비례 차감
  let outputVat = 0;
  for (const order of orders) {
    const isFullyDeducted =
      order.status === "RETURNED" ||
      order.status === "EXCHANGED" ||
      order.paymentStatus === "SALES_CANCELLED";
    if (isFullyDeducted) continue;
    outputVat += Number(order.taxAmount);
    // 부분환불 차감
    for (const item of order.items) {
      if (item.product?.taxType !== "TAXABLE") continue;
      const refundedAmount = Number(item.refundedAmount);
      if (refundedAmount > 0) {
        outputVat -= refundedAmount * Number(item.product.taxRate);
      }
    }
  }

  const totalAssets =
    receivables + inventory + inputVat + manualCash + manualEquipment + manualOtherAsset;
  const totalLiabilities = payables + outputVat + manualLoan + manualOtherLiability;
  const netAssets = totalAssets - totalLiabilities;
  // 당기순이익 추정 = 순자산 − 자본금 − 이익잉여금(전기). 자본금/이익잉여금 미입력 시 = netAssets
  const impliedNetIncome = netAssets - manualCapital - manualRetainedEarnings;

  return {
    asOf,
    vatPeriodStart,
    assets: {
      receivables: Math.round(receivables),
      inventory: Math.round(inventory),
      inputVat: Math.round(inputVat),
      cash: Math.round(manualCash),
      equipment: Math.round(manualEquipment),
      otherAsset: Math.round(manualOtherAsset),
      total: Math.round(totalAssets),
    },
    liabilities: {
      payables: Math.round(payables),
      outputVat: Math.round(outputVat),
      loan: Math.round(manualLoan),
      otherLiability: Math.round(manualOtherLiability),
      total: Math.round(totalLiabilities),
    },
    equity: {
      netAssets: Math.round(netAssets),
      capital: Math.round(manualCapital),
      retainedEarnings: Math.round(manualRetainedEarnings),
      impliedNetIncome: Math.round(impliedNetIncome),
    },
    manualEntries,
    meta: {
      customerAdvances: Math.round(customerAdvances),
      supplierAdvances: Math.round(supplierAdvances),
    },
  };
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const asOfParam = searchParams.get("asOf");
  const vatStartParam = searchParams.get("vatStart");

  const now = new Date();
  const asOf = asOfParam ? new Date(asOfParam) : now;
  // 기준일이 분기말일 수도 있으니 그 시점의 분기 시작 기준으로 부가세 누적
  const vatPeriodStart = vatStartParam
    ? new Date(vatStartParam)
    : getCurrentQuarterStart(asOf);

  const balanceSheet = await aggregate(asOf, vatPeriodStart);

  return NextResponse.json(balanceSheet);
}
