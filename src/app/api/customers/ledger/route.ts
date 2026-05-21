import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const LEDGER_TYPES = ["SALE", "RECEIPT", "ADJUSTMENT", "REFUND"] as const;
type LedgerType = (typeof LEDGER_TYPES)[number];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const typesParam = searchParams.get("types");
  const q = searchParams.get("q");

  const types = typesParam
    ? (typesParam.split(",").filter((t) => (LEDGER_TYPES as readonly string[]).includes(t)) as LedgerType[])
    : undefined;

  const entriesWhere: Prisma.CustomerLedgerWhereInput = {
    ...(customerId ? { customerId } : {}),
    ...(types && types.length > 0 ? { type: { in: types } } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q ? { customer: { name: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  // 환불 내역 (CustomerRefund) — ledger 와 별도. PAID 결제건의 실 환불 기록.
  // 같은 검색 필터(customerId/from/to/q) 적용. 잔액에는 영향 없으나 UI 에서 행으로 표시.
  const refundsWhere: Prisma.CustomerRefundWhereInput = {
    ...(customerId ? { customerId } : {}),
    ...(from || to
      ? {
          refundedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q ? { customer: { name: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  const [entries, refunds, summaries] = await Promise.all([
    prisma.customerLedger.findMany({
      where: entriesWhere,
      include: {
        customer: { select: { id: true, name: true } },
      },
      // 날짜는 최신순(desc), 같은 날짜 내에서는 발생순(asc) → 한 날 안에서 매출 → 수금 흐름이 자연스럽게 읽힘.
      // (현재 잔액 lookup 은 line 89 의 desc/desc 가 담당하므로 분리.)
      orderBy: [{ date: "desc" }, { createdAt: "asc" }],
      take: 1000,
    }),
    // types 필터가 적용되면 REFUND 도 포함된 경우만 환불 내역 노출 (필터 일관성)
    types === undefined || types.includes("REFUND")
      ? prisma.customerRefund.findMany({
          where: refundsWhere,
          include: {
            customer: { select: { id: true, name: true } },
            order: { select: { id: true, orderNo: true } },
          },
          orderBy: [{ refundedAt: "desc" }, { createdAt: "desc" }],
          take: 1000,
        })
      : Promise.resolve([]),
    prisma.customer.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        ledger: {
          select: {
            type: true,
            debitAmount: true,
            creditAmount: true,
            balance: true,
            date: true,
            createdAt: true,
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const customerSummaries = summaries.map((c) => {
    const currentBalance = c.ledger.length > 0 ? Number(c.ledger[0].balance) : 0;

    const openingBalance = fromDate
      ? (() => {
          const before = c.ledger.find((l) => l.date < fromDate);
          return before ? Number(before.balance) : 0;
        })()
      : 0;

    let totalSale = 0;
    let totalReceipt = 0;
    let totalAdjustment = 0;
    let totalRefund = 0;
    for (const l of c.ledger) {
      if (fromDate && l.date < fromDate) continue;
      if (toDate && l.date >= toDate) continue;
      if (l.type === "SALE") totalSale += Number(l.debitAmount);
      else if (l.type === "RECEIPT") totalReceipt += Number(l.creditAmount);
      else if (l.type === "ADJUSTMENT")
        totalAdjustment += Number(l.debitAmount) - Number(l.creditAmount);
      else if (l.type === "REFUND") totalRefund += Number(l.debitAmount);
    }

    return {
      customerId: c.id,
      customerName: c.name,
      customerType: c.type,
      currentBalance,
      openingBalance,
      totalSale,
      totalReceipt,
      totalAdjustment,
      totalRefund,
    };
  });

  // RECEIPT entry 에 수금 종류(kind) 부착 — referenceId 로 CustomerPayment batch 조회
  const paymentRefIds = entries
    .filter(
      (e) =>
        e.type === "RECEIPT" &&
        e.referenceType === "CUSTOMER_PAYMENT" &&
        e.referenceId,
    )
    .map((e) => e.referenceId as string);
  const paymentKindMap = new Map<string, string>();
  if (paymentRefIds.length > 0) {
    const payments = await prisma.customerPayment.findMany({
      where: { id: { in: paymentRefIds } },
      select: { id: true, kind: true },
    });
    for (const p of payments) paymentKindMap.set(p.id, p.kind);
  }
  const entriesWithKind = entries.map((e) => ({
    ...e,
    paymentKind: e.referenceId ? (paymentKindMap.get(e.referenceId) ?? null) : null,
  }));

  return NextResponse.json({ entries: entriesWithKind, refunds, customerSummaries });
}
