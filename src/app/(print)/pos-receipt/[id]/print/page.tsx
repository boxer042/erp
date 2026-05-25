import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ReceiptClient } from "./receipt-client";

/**
 * POS 영수증 — 80mm 영수증 프린터 친화. Order 기반.
 * 매장 사장님이 결제 직후 자동으로 띄워서 출력.
 */
export default async function PosReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [order, company] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        channel: true,
        items: {
          include: { product: { select: { name: true, sku: true } } },
        },
      },
    }),
    prisma.companyInfo.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!order) notFound();

  const lines = order.items.map((it) => ({
    name: it.product?.name ?? it.serviceName ?? "—",
    sku: it.product?.sku ?? null,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    totalPrice: Number(it.totalPrice),
  }));

  return (
    <ReceiptClient
      auto={sp.auto === "1"}
      data={{
        orderNo: order.orderNo,
        orderDate: format(new Date(order.orderDate), "yyyy-MM-dd HH:mm"),
        company: {
          name: company?.name ?? "우리 상호",
          phone: company?.phone ?? null,
          businessNumber: company?.businessNumber ?? null,
          address: company?.address ?? null,
          ceo: company?.ceo ?? null,
        },
        customer: order.customer
          ? { name: order.customer.name, phone: order.customer.phone }
          : null,
        channel: order.channel?.name ?? "오프라인",
        fulfillmentType: order.fulfillmentType,
        // 매장 인도(IN_STORE/PICKUP) 는 배송 정보 무관
        shippingAddress:
          order.fulfillmentType === "IN_STORE" || order.fulfillmentType === "PICKUP"
            ? null
            : order.shippingAddress,
        recipientName:
          order.fulfillmentType === "IN_STORE" || order.fulfillmentType === "PICKUP"
            ? null
            : order.recipientName ?? order.customerName,
        recipientPhone:
          order.fulfillmentType === "IN_STORE" || order.fulfillmentType === "PICKUP"
            ? null
            : order.recipientPhone ?? order.customerPhone,
        expectedShipDate:
          order.fulfillmentType === "IN_STORE" ||
          order.fulfillmentType === "PICKUP" ||
          !order.expectedShipDate
            ? null
            : format(new Date(order.expectedShipDate), "yyyy-MM-dd"),
        lines,
        subtotal: Number(order.subtotalAmount),
        taxAmount: Number(order.taxAmount),
        totalAmount: Number(order.totalAmount),
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        // 부분 결제 메타 — 계약금/일부결제일 때 영수증 헤더·결제정보 분기
        paidAmount: order.paidAmount ? Number(order.paidAmount) : null,
        partialPaymentKind: order.partialPaymentKind,
        memo: order.memo,
      }}
    />
  );
}
