import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { statementSchema } from "@/lib/validators/statement";
import { Prisma } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const statement = await prisma.statement.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: true,
      order: { select: { id: true, orderNo: true } },
      quotation: { select: { id: true, quotationNo: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!statement) {
    return NextResponse.json({ error: "거래명세표를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(statement);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = statementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const items = data.items.map((it, idx) => {
    const qty = new Prisma.Decimal(it.quantity);
    const price = new Prisma.Decimal(it.unitPrice);
    const listP = new Prisma.Decimal(it.listPrice || it.unitPrice);
    const disc = new Prisma.Decimal(it.discountAmount || "0");
    return {
      productId: it.productId || null,
      name: it.name,
      spec: it.spec || null,
      unitOfMeasure: it.unitOfMeasure || "EA",
      quantity: qty,
      listPrice: listP,
      discountAmount: disc,
      unitPrice: price,
      totalPrice: qty.mul(price),
      isTaxable: it.isTaxable,
      sortOrder: it.sortOrder ?? idx,
      memo: it.memo || null,
    };
  });

  const subtotal = items.reduce((acc, it) => acc.add(it.totalPrice), new Prisma.Decimal(0));
  const tax = items.reduce(
    (acc, it) => (it.isTaxable ? acc.add(it.totalPrice.mul("0.1")) : acc),
    new Prisma.Decimal(0)
  );
  const total = subtotal.add(tax);

  const statement = await prisma.$transaction(async (tx) => {
    await tx.statementItem.deleteMany({ where: { statementId: id } });
    return tx.statement.update({
      where: { id },
      data: {
        status: data.status,
        issueDate: new Date(data.issueDate),
        customerId: data.customerId || null,
        customerNameSnapshot: data.customerNameSnapshot ?? null,
        customerPhoneSnapshot: data.customerPhoneSnapshot ?? null,
        customerAddressSnapshot: data.customerAddressSnapshot ?? null,
        customerBusinessNumberSnapshot: data.customerBusinessNumberSnapshot ?? null,
        orderId: data.orderId || null,
        quotationId: data.quotationId || null,
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: total,
        memo: data.memo ?? null,
        items: { create: items },
      },
      include: { items: true, customer: true },
    });
  });

  return NextResponse.json(statement);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.statement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
