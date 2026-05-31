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
  searchParams: Promise<{ auto?: string; supplyOnly?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const [clicked, company] = await Promise.all([
    prisma.order.findUnique({ where: { id }, select: { splitGroupId: true } }),
    prisma.companyInfo.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!clicked) notFound();

  // 분할 출고 — splitGroupId 형제(매장수령 A + 택배 백오더 B)를 합산해 영수증 1장
  // (docs/SPLIT_FULFILLMENT.md §8). 비분할이면 단일 주문 그대로 — 기존 동작 불변.
  const orders = await prisma.order.findMany({
    where: clicked.splitGroupId ? { splitGroupId: clicked.splitGroupId } : { id },
    include: {
      customer: true,
      channel: true,
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
    orderBy: [{ splitParentId: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
  if (orders.length === 0) notFound();

  const primary = orders[0];
  const isSplitGroup = orders.length > 1;
  const allItems = orders.flatMap((o) => o.items);
  // 배송 정보는 그룹의 택배(SHIPPING/DELIVERY 등) 주문 기준, 없으면 대표(단일도 대표).
  const shipOrder =
    orders.find(
      (o) => o.fulfillmentType !== "IN_STORE" && o.fulfillmentType !== "PICKUP",
    ) ?? primary;
  const isStorePickup =
    shipOrder.fulfillmentType === "IN_STORE" ||
    shipOrder.fulfillmentType === "PICKUP";

  const lines = allItems.map((it) => ({
    name: it.product?.name ?? it.serviceName ?? "—",
    sku: it.product?.sku ?? null,
    quantity: Number(it.quantity),
    unitPrice: Number(it.unitPrice),
    totalPrice: Number(it.totalPrice),
    // 서비스 지급 — 영수증에 "[서비스]" 표시 + 정가 strike. 0원 라인도 안전망으로 포함.
    isService: it.isService || (Number(it.unitPrice) === 0 && Number(it.quantity) > 0),
    listPrice: it.listPrice ? Number(it.listPrice) : null,
  }));

  // 분할이면 어떤 주문이 매장수령/택배인지 안내 라인
  const splitNote = isSplitGroup
    ? `분할 출고 — ${orders
        .map(
          (o) =>
            `${o.fulfillmentType === "IN_STORE" || o.fulfillmentType === "PICKUP" ? "매장수령" : "택배"} ${o.orderNo}`,
        )
        .join(" / ")}`
    : null;

  return (
    <ReceiptClient
      auto={sp.auto === "1"}
      initialSupplyOnly={sp.supplyOnly === "1"}
      data={{
        orderNo: primary.orderNo,
        orderDate: format(new Date(primary.orderDate), "yyyy-MM-dd HH:mm"),
        company: {
          name: company?.name ?? "우리 상호",
          phone: company?.phone ?? null,
          businessNumber: company?.businessNumber ?? null,
          address: company?.address ?? null,
          ceo: company?.ceo ?? null,
        },
        customer: primary.customer
          ? { name: primary.customer.name, phone: primary.customer.phone }
          : null,
        channel: primary.channel?.name ?? "오프라인",
        // 분할이면 택배(B) 기준으로 배송 섹션 노출, 단일이면 그 주문 기준
        fulfillmentType: shipOrder.fulfillmentType,
        shippingAddress: isStorePickup ? null : shipOrder.shippingAddress,
        recipientName: isStorePickup
          ? null
          : shipOrder.recipientName ?? shipOrder.customerName,
        recipientPhone: isStorePickup
          ? null
          : shipOrder.recipientPhone ?? shipOrder.customerPhone,
        expectedShipDate:
          isStorePickup || !shipOrder.expectedShipDate
            ? null
            : format(new Date(shipOrder.expectedShipDate), "yyyy-MM-dd"),
        lines,
        // 분할 그룹 합산 (주문별 자체 결제라 단순 Σ 로 정합)
        subtotal: orders.reduce((s, o) => s + Number(o.subtotalAmount), 0),
        taxAmount: orders.reduce((s, o) => s + Number(o.taxAmount), 0),
        totalAmount: orders.reduce((s, o) => s + Number(o.totalAmount), 0),
        paymentMethod: primary.paymentMethod,
        paymentStatus: primary.paymentStatus,
        // 부분 결제 메타 — 분할은 전액결제만 허용이라 대표 기준만
        paidAmount: primary.paidAmount ? Number(primary.paidAmount) : null,
        partialPaymentKind: primary.partialPaymentKind,
        memo: [splitNote, primary.memo].filter(Boolean).join(" · ") || null,
      }}
    />
  );
}
