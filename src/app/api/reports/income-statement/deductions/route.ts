import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 손익계산서 매출 차감 드릴다운 — 어떤 주문이 환불·교환·매출취소·부분환불됐는지 리스트

type DeductionKind = "refund" | "exchange" | "cancel" | "partial";

interface DeductionRow {
  orderId: string;
  orderNo: string;
  orderDate: string;
  customerName: string | null;
  kind: DeductionKind;
  amount: number; // 공급가액 차감액
  totalAmount: number; // 주문 총액 (참고)
}

function classifyKind(
  status: string,
  paymentStatus: string,
  hasPartialRefund: boolean,
): DeductionKind | null {
  if (paymentStatus === "SALES_CANCELLED") return "cancel";
  if (status === "RETURNED") return "refund";
  if (status === "EXCHANGED") return "exchange";
  if (hasPartialRefund) return "partial";
  return null;
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const kindFilter = searchParams.get("kind") as DeductionKind | null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const from = fromParam ? new Date(fromParam) : monthStart;
  const to = toParam ? new Date(toParam) : monthEnd;

  // 차감 발생 가능 status: RETURNED, EXCHANGED, 또는 활성 + 부분환불
  const orders = await prisma.order.findMany({
    where: {
      orderDate: { gte: from, lt: to },
      OR: [
        { status: { in: ["RETURNED", "EXCHANGED"] } },
        { paymentStatus: "SALES_CANCELLED" },
        { items: { some: { refundedAmount: { gt: 0 } } } },
      ],
    },
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      customer: { select: { name: true } },
      items: {
        select: {
          totalPrice: true,
          refundedAmount: true,
          product: { select: { taxType: true, taxRate: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });

  const rows: DeductionRow[] = [];
  for (const order of orders) {
    const hasPartial = order.items.some((i) => Number(i.refundedAmount) > 0);
    const kind = classifyKind(order.status, order.paymentStatus, hasPartial);
    if (!kind) continue;
    if (kindFilter && kindFilter !== kind) continue;

    // 차감액 = (전액차감) Σ totalPrice 공급가액 환산 / (부분) Σ refundedAmount 공급가액 환산
    let deductionAmount = 0;
    for (const item of order.items) {
      const totalPrice = Number(item.totalPrice);
      const refundedAmount = Number(item.refundedAmount);
      const taxRate =
        item.product?.taxType === "TAXABLE" ? Number(item.product.taxRate) : 0;
      if (kind === "partial") {
        if (refundedAmount > 0) {
          deductionAmount += taxRate > 0 ? refundedAmount / (1 + taxRate) : refundedAmount;
        }
      } else {
        deductionAmount += taxRate > 0 ? totalPrice / (1 + taxRate) : totalPrice;
      }
    }

    rows.push({
      orderId: order.id,
      orderNo: order.orderNo,
      orderDate: order.orderDate.toISOString(),
      customerName: order.customer?.name ?? null,
      kind,
      amount: Math.round(deductionAmount),
      totalAmount: Math.round(Number(order.totalAmount)),
    });
  }

  // 차감액 큰 순
  rows.sort((a, b) => b.amount - a.amount);

  return NextResponse.json({ rows, period: { from, to } });
}
