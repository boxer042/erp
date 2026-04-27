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

  const [entries, summaries] = await Promise.all([
    prisma.customerLedger.findMany({
      where: entriesWhere,
      include: {
        customer: { select: { id: true, name: true } },
      },
      // 날짜는 최신순, 같은 날짜 내에서도 최신 생성순 → 잔액이 위에서 아래로 단조감소
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    }),
    prisma.customer.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        name: true,
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
      currentBalance,
      openingBalance,
      totalSale,
      totalReceipt,
      totalAdjustment,
      totalRefund,
    };
  });

  return NextResponse.json({ entries, customerSummaries });
}
