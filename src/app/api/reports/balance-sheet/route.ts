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

interface AssetBreakdown {
  receivables: number;
  inventory: number;
  inputVat: number;
  other: number; // 현금/비품 등 시스템 외 (V1=0)
  total: number;
}

interface LiabilityBreakdown {
  payables: number;
  outputVat: number;
  other: number;
  total: number;
}

interface BalanceSheet {
  asOf: Date;
  vatPeriodStart: Date;
  assets: AssetBreakdown;
  liabilities: LiabilityBreakdown;
  equity: {
    netAssets: number; // 자산 - 부채
  };
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
    orders,
    expenses,
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
    prisma.incoming.findMany({
      where: {
        status: "CONFIRMED",
        incomingDate: { gte: vatPeriodStart, lte: asOf },
      },
      select: { taxAmount: true },
    }),
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
      select: { taxAmount: true },
    }),
    prisma.expense.findMany({
      where: {
        date: { gte: vatPeriodStart, lte: asOf },
        isTaxable: true,
        recoverable: false,
      },
      select: { amount: true },
    }),
  ]);

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
  const inputVatFromIncoming = incomings.reduce(
    (s, i) => s + Number(i.taxAmount),
    0,
  );
  // 과세 Expense 의 매입세액 (= raw - raw/1.1 = raw × 1/11)
  const inputVatFromExpenses = expenses.reduce(
    (s, e) => s + Number(e.amount) / 11,
    0,
  );
  const inputVat = inputVatFromIncoming + inputVatFromExpenses;

  // 부가세 부채 (매출 부가세 누적)
  const outputVat = orders.reduce((s, o) => s + Number(o.taxAmount), 0);

  const totalAssets = receivables + inventory + inputVat;
  const totalLiabilities = payables + outputVat;
  const netAssets = totalAssets - totalLiabilities;

  return {
    asOf,
    vatPeriodStart,
    assets: {
      receivables: Math.round(receivables),
      inventory: Math.round(inventory),
      inputVat: Math.round(inputVat),
      other: 0,
      total: Math.round(totalAssets),
    },
    liabilities: {
      payables: Math.round(payables),
      outputVat: Math.round(outputVat),
      other: 0,
      total: Math.round(totalLiabilities),
    },
    equity: {
      netAssets: Math.round(netAssets),
    },
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
