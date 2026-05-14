import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 상품별 실판매 단가 이력 + 통계.
 * - 최근 100건의 OrderItem (취소/반품/교환 새 주문 -EX 제외) 의 정가/할인/실판매 단가 추적.
 * - 평균 할인율 + 최저/최고 실판매 단가 KPI.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const items = await prisma.orderItem.findMany({
    where: {
      productId: id,
      // 교환 새 주문 (-EX) 은 매출 중복 방지로 제외 (마진 리포트 정책과 일치)
      order: {
        status: { not: "CANCELLED" },
        exchangedFromOrders: { none: {} },
      },
    },
    select: {
      id: true,
      quantity: true,
      listPrice: true,
      discountAmount: true,
      unitPrice: true,
      totalPrice: true,
      order: {
        select: {
          id: true,
          orderNo: true,
          orderDate: true,
          status: true,
          paymentStatus: true,
          channel: { select: { name: true, code: true } },
          customerName: true,
        },
      },
    },
    orderBy: { order: { orderDate: "desc" } },
    take: 100,
  });

  // 통계 집계 — listPrice 가 있는 항목만 할인율 계산
  let totalQty = 0;
  let totalNetRevenue = 0; // unitPrice × qty 합
  let totalListRevenue = 0; // listPrice × qty 합 (listPrice 있는 라인만)
  let listQty = 0;
  let minUnitPrice: number | null = null;
  let maxUnitPrice: number | null = null;
  let discountedLineCount = 0;

  for (const it of items) {
    const qty = Number(it.quantity);
    const unit = Number(it.unitPrice);
    const list = it.listPrice ? Number(it.listPrice) : 0;
    totalQty += qty;
    totalNetRevenue += unit * qty;
    if (list > 0) {
      totalListRevenue += list * qty;
      listQty += qty;
      if (list !== unit) discountedLineCount += 1;
    }
    if (minUnitPrice === null || unit < minUnitPrice) minUnitPrice = unit;
    if (maxUnitPrice === null || unit > maxUnitPrice) maxUnitPrice = unit;
  }

  const avgUnitPrice = totalQty > 0 ? totalNetRevenue / totalQty : 0;
  const avgListPrice = listQty > 0 ? totalListRevenue / listQty : 0;
  const avgDiscountPercent =
    avgListPrice > 0 ? ((avgListPrice - avgUnitPrice) / avgListPrice) * 100 : 0;

  return NextResponse.json({
    items,
    stats: {
      lineCount: items.length,
      totalQty,
      avgUnitPrice: Math.round(avgUnitPrice),
      avgListPrice: Math.round(avgListPrice),
      avgDiscountPercent: Math.round(avgDiscountPercent * 10) / 10,
      minUnitPrice: minUnitPrice ?? 0,
      maxUnitPrice: maxUnitPrice ?? 0,
      discountedLineCount,
    },
  });
}
