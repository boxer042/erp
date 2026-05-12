import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 고객의 환불·교환 가능 주문 목록 — POS 의 반품/교환 진입 sheet 가 사용.
 *
 * 포함 상태 (단축 경로 가능):
 *   - COMPLETED (배송완료)        → 즉시 반품(return) / 즉시 교환(exchange) 가능
 *   - RETURN_INSPECTED            → 검수 완료 후 환불 종결 대기
 *
 * 제외:
 *   - PENDING/PREPARING/PREPARING_PACKED/SHIPPED — 출고 진행 중 (cancel 사용)
 *   - CANCELLED/RETURNED/EXCHANGED — 이미 종결
 *   - SALES_CANCELLED 결제건의 종결 주문도 제외 (이미 매출 취소)
 *   - 교환 발송 새 주문(-EX, exchangedFromOrders 가 있음) — 원본만 환불 대상
 *
 * 정렬: 최근 주문 우선 (orderDate desc).
 * 최대 30건.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: customerId } = await params;

  const orders = await prisma.order.findMany({
    where: {
      customerId,
      status: { in: ["COMPLETED", "RETURN_INSPECTED"] },
      // 교환 발송 새 주문(-EX) 은 제외 — 원본만 환불·교환 진입 대상
      exchangedFromOrders: { none: {} },
    },
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      totalAmount: true,
      channelOrderNo: true,
      channel: { select: { name: true, code: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          returnedQty: true,
          refundedAmount: true,
          serviceName: true,
          product: { select: { name: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
    take: 30,
  });

  return NextResponse.json(orders);
}
