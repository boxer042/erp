import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { generateStatementNo } from "@/lib/document-no";

/**
 * 주문 → 거래명세표 발행.
 * 주문 품목·고객 정보를 그대로 복사해 Statement 레코드를 생성하고 orderId 로 연결한다.
 * 이미 발행된(취소 안 된) 거래명세표가 있으면 중복 생성하지 않고 기존 것을 반환한다.
 * 발행 후 주문이 취소되면 연결된 거래명세표도 CANCELLED 로 함께 처리된다.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              spec: true,
              unitOfMeasure: true,
              taxType: true,
            },
          },
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다" }, { status: 404 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "취소된 주문은 거래명세표를 발행할 수 없습니다" },
      { status: 400 },
    );
  }

  // 이미 발행된 (취소 안 된) 거래명세표가 있으면 중복 생성 없이 반환
  const existing = await prisma.statement.findFirst({
    where: { orderId: id, status: { not: "CANCELLED" } },
    select: { id: true, statementNo: true },
  });
  if (existing) {
    return NextResponse.json({ alreadyIssued: true, ...existing });
  }

  const items = order.items.map((it, idx) => {
    const totalPrice = new Prisma.Decimal(it.totalPrice);
    return {
      productId: it.productId,
      name: it.product?.name ?? it.serviceName ?? "—",
      spec: it.product?.spec ?? null,
      unitOfMeasure: it.product?.unitOfMeasure ?? "EA",
      quantity: new Prisma.Decimal(it.quantity),
      listPrice: new Prisma.Decimal(it.listPrice ?? it.unitPrice),
      discountAmount: new Prisma.Decimal(it.discountAmount ?? 0),
      unitPrice: new Prisma.Decimal(it.unitPrice),
      totalPrice,
      // 상품은 taxType 기준, 서비스(기술료) 라인은 항상 과세
      isTaxable: it.product ? it.product.taxType === "TAXABLE" : true,
      sortOrder: idx,
      memo: null,
    };
  });

  const subtotal = items.reduce(
    (acc, it) => acc.add(it.totalPrice),
    new Prisma.Decimal(0),
  );
  const tax = items.reduce(
    (acc, it) => (it.isTaxable ? acc.add(it.totalPrice.mul("0.1")) : acc),
    new Prisma.Decimal(0),
  );
  const total = subtotal.add(tax);

  const statement = await prisma.statement.create({
    data: {
      statementNo: generateStatementNo(),
      status: "ISSUED",
      issueDate: order.orderDate,
      customerId: order.customerId,
      customerNameSnapshot: order.customer?.name ?? order.customerName ?? null,
      customerPhoneSnapshot: order.customer?.phone ?? order.customerPhone ?? null,
      customerAddressSnapshot:
        order.customer?.address ?? order.shippingAddress ?? null,
      customerBusinessNumberSnapshot: order.customer?.businessNumber ?? null,
      orderId: id,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount: total,
      createdById: user.id,
      items: { create: items },
    },
    select: { id: true, statementNo: true },
  });

  return NextResponse.json(statement, { status: 201 });
}
