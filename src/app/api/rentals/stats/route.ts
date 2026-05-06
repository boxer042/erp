import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 임대 통계 — 자산별 가동률, 기간별 매출, 상태별 카운트.
 *
 * Query:
 *   from, to (yyyy-MM-dd) — 기간 필터 (default: 최근 90일)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 90 * 86400_000);
  const from = fromStr ? new Date(fromStr) : defaultFrom;
  const to = toStr ? new Date(toStr) : now;

  // 1. 상태별 카운트 (전체 — 기간 무관, 현재 활성 분)
  const statusGroups = await prisma.rental.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const statusCounts: Record<string, number> = {};
  for (const g of statusGroups) statusCounts[g.status] = g._count._all;

  // 2. 기간 매출 (RETURNED 인 임대만 반영, actualReturnedAt 기준)
  const returnedInPeriod = await prisma.rental.findMany({
    where: {
      status: "RETURNED",
      actualReturnedAt: { gte: from, lte: to },
    },
    select: { finalAmount: true, actualReturnedAt: true },
  });
  const totalRevenue = returnedInPeriod.reduce((s, r) => s + Number(r.finalAmount), 0);
  const completedCount = returnedInPeriod.length;

  // 3. 자산별 가동률 — 기간 내 ACTIVE/OVERDUE/RETURNED 임대의 totalUnits 합 / 기간 일수
  // 단순 근사치: 기간 내 임대 발생 횟수 + 총 finalAmount
  const assetActivity = await prisma.rental.groupBy({
    by: ["assetId"],
    where: {
      OR: [
        { status: "ACTIVE" },
        { status: "OVERDUE" },
        { status: "RETURNED", actualReturnedAt: { gte: from, lte: to } },
      ],
    },
    _count: { _all: true },
    _sum: { finalAmount: true, totalUnits: true },
  });
  const assetIds = assetActivity.map((a) => a.assetId);
  const assets = await prisma.rentalAsset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, name: true, assetNo: true, brand: true },
  });
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const periodDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400_000));

  const byAsset = assetActivity
    .map((a) => {
      const asset = assetMap.get(a.assetId);
      const usedDays = Number(a._sum.totalUnits ?? 0);
      const utilization = Math.min(100, Math.round((usedDays / periodDays) * 100));
      return {
        assetId: a.assetId,
        assetNo: asset?.assetNo ?? "?",
        name: asset?.name ?? "(삭제됨)",
        brand: asset?.brand ?? null,
        rentalCount: a._count._all,
        usedDays,
        utilization,
        revenue: Number(a._sum.finalAmount ?? 0),
      };
    })
    .sort((a, b) => b.utilization - a.utilization);

  // 4. OVERDUE 현재 목록
  const overdueRentals = await prisma.rental.findMany({
    where: { status: "OVERDUE" },
    take: 50,
    orderBy: { endDate: "asc" },
    select: {
      id: true,
      rentalNo: true,
      endDate: true,
      finalAmount: true,
      asset: { select: { name: true, assetNo: true } },
      customer: { select: { name: true, phone: true } },
    },
  });

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString(), days: periodDays },
    statusCounts,
    revenue: { total: totalRevenue, completedCount },
    byAsset,
    overdue: overdueRentals.map((r) => ({
      id: r.id,
      rentalNo: r.rentalNo,
      endDate: r.endDate.toISOString(),
      daysOverdue: Math.max(0, Math.floor((now.getTime() - r.endDate.getTime()) / 86400_000)),
      finalAmount: Number(r.finalAmount),
      assetName: r.asset.name,
      assetNo: r.asset.assetNo,
      customerName: r.customer.name,
      customerPhone: r.customer.phone,
    })),
  });
}
