import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const LEDGER_TYPES = ["PURCHASE", "PAYMENT", "ADJUSTMENT", "REFUND"] as const;
type LedgerType = (typeof LEDGER_TYPES)[number];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const typesParam = searchParams.get("types"); // comma-separated e.g. "PURCHASE,PAYMENT"
  const q = searchParams.get("q");

  const types = typesParam
    ? (typesParam.split(",").filter((t) => (LEDGER_TYPES as readonly string[]).includes(t)) as LedgerType[])
    : undefined;

  const entriesWhere: Prisma.SupplierLedgerWhereInput = {
    ...(supplierId ? { supplierId } : {}),
    ...(types && types.length > 0 ? { type: { in: types } } : {}),
    ...(from || to
      ? {
          date: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lt: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q ? { supplier: { name: { contains: q, mode: "insensitive" as const } } } : {}),
  };

  const [entries, summaries] = await Promise.all([
    prisma.supplierLedger.findMany({
      where: entriesWhere,
      include: {
        supplier: { select: { id: true, name: true, paymentMethod: true } },
      },
      // 날짜는 최신순, 같은 날짜 내에서도 최신 생성순 → 잔액이 위에서 아래로 단조감소
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    }),
    // 좌측 거래처 목록용 요약: 모든 거래처 + 현재 잔액(가장 최근 ledger) + 기간 내 유형별 합계
    prisma.supplier.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        balanceLedger: {
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

  const supplierSummaries = summaries.map((s) => {
    // 현재 잔액: 기간 무관하게 가장 최근 ledger.balance (date desc, createdAt desc)
    const currentBalance = s.balanceLedger.length > 0 ? Number(s.balanceLedger[0].balance) : 0;

    // 이월 잔액: from 이전 마지막 엔트리의 balance. from 없으면 0.
    const openingBalance = fromDate
      ? (() => {
          const before = s.balanceLedger.find((l) => l.date < fromDate);
          return before ? Number(before.balance) : 0;
        })()
      : 0;

    // 기간 내 유형별 합계
    let totalPurchase = 0;
    let totalPayment = 0;
    let totalAdjustment = 0;
    let totalRefund = 0;
    for (const l of s.balanceLedger) {
      if (fromDate && l.date < fromDate) continue;
      if (toDate && l.date >= toDate) continue;
      if (l.type === "PURCHASE") totalPurchase += Number(l.debitAmount);
      else if (l.type === "PAYMENT") totalPayment += Number(l.creditAmount);
      else if (l.type === "ADJUSTMENT")
        totalAdjustment += Number(l.debitAmount) - Number(l.creditAmount);
      else if (l.type === "REFUND") totalRefund += Number(l.creditAmount);
    }

    return {
      supplierId: s.id,
      supplierName: s.name,
      currentBalance,
      openingBalance,
      totalPurchase,
      totalPayment,
      totalAdjustment,
      totalRefund,
    };
  });

  return NextResponse.json({ entries, supplierSummaries });
}
