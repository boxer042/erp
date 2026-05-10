import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

/**
 * 옵션 funnel 리포트 — 손님 진입 SKU vs 결제 SKU 집계 (B2C 자사몰/외부 채널 한정).
 *
 * entryProductId 가 있는 OrderItem 만 집계 (POS 는 자연 제외 — 직원 입력이라 funnel 무관).
 * 행 그룹: (entryProductId, productId) 쌍 — 진입 페이지와 실제 결제 SKU 의 매트릭스.
 *
 * 응답:
 *   rows: [{ entryProduct, finalProduct, orderCount, quantity, revenue }]
 *   totals: { entryProductId 별 합계 + 전체 funnel summary }
 *
 * 필터:
 *   ?from=YYYY-MM-DD  주문일 시작
 *   ?to=YYYY-MM-DD    주문일 끝
 *   ?channelId=...    채널 한정 (미지정 시 모든 채널 — 단 entryProductId 가 있는 주문만)
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const channelId = searchParams.get("channelId");

  const from = fromStr ? new Date(`${fromStr}T00:00:00`) : null;
  const to = toStr ? new Date(`${toStr}T23:59:59.999`) : null;

  const items = await prisma.orderItem.findMany({
    where: {
      // funnel 분석은 entryProductId 가 채워진 주문만 (자사몰/외부 채널)
      entryProductId: { not: null },
      // OPTION_REF 자식 라인은 분석 제외 — 메인 라인만
      lineRole: "MAIN",
      order: {
        // CANCELLED 제외 — 실제 결제 완료된 흐름만 의미
        status: { notIn: ["CANCELLED"] },
        ...(from || to
          ? {
              orderDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(channelId ? { channelId } : {}),
      },
    },
    select: {
      productId: true,
      entryProductId: true,
      quantity: true,
      totalPrice: true,
      orderId: true,
      product: { select: { id: true, name: true, sku: true } },
      entryProduct: { select: { id: true, name: true, sku: true } },
    },
  });

  // (entryProductId, productId) 쌍으로 집계
  type RowKey = string;
  const rowMap = new Map<
    RowKey,
    {
      entryProduct: { id: string; name: string; sku: string };
      finalProduct: { id: string; name: string; sku: string } | null;
      orderIds: Set<string>;
      quantity: number;
      revenue: number;
    }
  >();
  for (const it of items) {
    if (!it.entryProductId || !it.entryProduct) continue;
    const finalId = it.productId ?? "null";
    const key = `${it.entryProductId}::${finalId}`;
    let row = rowMap.get(key);
    if (!row) {
      row = {
        entryProduct: it.entryProduct,
        finalProduct: it.product,
        orderIds: new Set(),
        quantity: 0,
        revenue: 0,
      };
      rowMap.set(key, row);
    }
    row.orderIds.add(it.orderId);
    row.quantity += Number(it.quantity);
    row.revenue += Number(it.totalPrice);
  }

  const rows = Array.from(rowMap.values()).map((r) => ({
    entryProduct: r.entryProduct,
    finalProduct: r.finalProduct,
    orderCount: r.orderIds.size,
    quantity: r.quantity,
    revenue: r.revenue,
    // swap 발생 여부 — entry ≠ final 이면 옵션 swap 으로 결제된 케이스
    isSwap: r.entryProduct.id !== r.finalProduct?.id,
  }));

  // entryProductId 별 합계 — funnel 진입 페이지 단위 비교
  const byEntry = new Map<
    string,
    {
      entryProduct: { id: string; name: string; sku: string };
      orderIds: Set<string>;
      quantity: number;
      revenue: number;
      swapCount: number;
    }
  >();
  for (const r of rows) {
    const id = r.entryProduct.id;
    let agg = byEntry.get(id);
    if (!agg) {
      agg = {
        entryProduct: r.entryProduct,
        orderIds: new Set(),
        quantity: 0,
        revenue: 0,
        swapCount: 0,
      };
      byEntry.set(id, agg);
    }
    agg.quantity += r.quantity;
    agg.revenue += r.revenue;
    if (r.isSwap) agg.swapCount += r.orderCount;
  }
  // 주문 ID 합치기 — entry 단위 unique order 수
  for (const it of items) {
    if (!it.entryProductId) continue;
    byEntry.get(it.entryProductId)?.orderIds.add(it.orderId);
  }
  const entrySummary = Array.from(byEntry.values())
    .map((a) => ({
      entryProduct: a.entryProduct,
      orderCount: a.orderIds.size,
      quantity: a.quantity,
      revenue: a.revenue,
      swapCount: a.swapCount,
      swapRate: a.orderIds.size > 0 ? a.swapCount / a.orderIds.size : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  rows.sort((a, b) => {
    if (a.entryProduct.id !== b.entryProduct.id) {
      return b.revenue - a.revenue;
    }
    return b.revenue - a.revenue;
  });

  const totalOrderIds = new Set<string>();
  let totalQty = 0;
  let totalRevenue = 0;
  let totalSwapCount = 0;
  for (const r of rows) {
    totalQty += r.quantity;
    totalRevenue += r.revenue;
    if (r.isSwap) totalSwapCount += r.orderCount;
  }
  for (const it of items) totalOrderIds.add(it.orderId);

  return NextResponse.json({
    rows,
    entrySummary,
    total: {
      orderCount: totalOrderIds.size,
      quantity: totalQty,
      revenue: totalRevenue,
      swapCount: totalSwapCount,
      swapRate: totalOrderIds.size > 0 ? totalSwapCount / totalOrderIds.size : 0,
    },
    period: { from: fromStr, to: toStr },
  });
}
