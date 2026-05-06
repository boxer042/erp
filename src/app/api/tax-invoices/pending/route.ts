import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 세금계산서 발행 대기 — Order.taxInvoiceRequested=true && taxInvoicedAt=null.
 * 사장님이 외부 세무 시스템에서 발행한 후 PATCH 로 발행일 마킹.
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const includeInvoiced = searchParams.get("includeInvoiced") === "1";

  const orders = await prisma.order.findMany({
    where: {
      taxInvoiceRequested: true,
      ...(includeInvoiced ? {} : { taxInvoicedAt: null }),
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      orderNo: true,
      orderDate: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      totalAmount: true,
      taxAmount: true,
      taxInvoicedAt: true,
      paymentMethod: true,
      customer: {
        select: {
          name: true,
          businessNumber: true,
          ceo: true,
          email: true,
          address: true,
        },
      },
      channel: { select: { name: true } },
    },
    orderBy: { orderDate: "asc" },
    take: 500,
  });

  const items = orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    orderDate: o.orderDate.toISOString(),
    customerId: o.customerId,
    customerName: o.customer?.name ?? o.customerName,
    customerPhone: o.customerPhone,
    businessNumber: o.customer?.businessNumber ?? null,
    ceo: o.customer?.ceo ?? null,
    email: o.customer?.email ?? null,
    address: o.customer?.address ?? null,
    totalAmount: Number(o.totalAmount),
    taxAmount: Number(o.taxAmount),
    paymentMethod: o.paymentMethod,
    channelName: o.channel?.name ?? null,
    taxInvoicedAt: o.taxInvoicedAt ? o.taxInvoicedAt.toISOString() : null,
  }));

  const summary = {
    pendingCount: items.filter((i) => !i.taxInvoicedAt).length,
    pendingAmount: items
      .filter((i) => !i.taxInvoicedAt)
      .reduce((s, i) => s + i.totalAmount, 0),
    pendingTaxAmount: items
      .filter((i) => !i.taxInvoicedAt)
      .reduce((s, i) => s + i.taxAmount, 0),
  };

  return NextResponse.json({ items, summary });
}
