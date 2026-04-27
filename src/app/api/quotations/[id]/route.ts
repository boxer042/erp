import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { quotationSchema } from "@/lib/validators/quotation";
import { Prisma } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: true,
      supplier: true,
      createdBy: { select: { name: true } },
      orders: { select: { id: true, orderNo: true } },
      incomings: { select: { id: true, incomingNo: true } },
      statements: { select: { id: true, statementNo: true } },
    },
  });
  if (!quotation) {
    return NextResponse.json({ error: "견적서를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(quotation);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = quotationSchema.safeParse(body);

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
      supplierProductId: it.supplierProductId || null,
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

  const quotation = await prisma.$transaction(async (tx) => {
    await tx.quotationItem.deleteMany({ where: { quotationId: id } });
    return tx.quotation.update({
      where: { id },
      data: {
        type: data.type,
        status: data.status,
        issueDate: new Date(data.issueDate),
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        customerId: data.type === "SALES" ? data.customerId || null : null,
        supplierId: data.type === "PURCHASE" ? data.supplierId || null : null,
        title: data.title ?? null,
        subtotalAmount: subtotal,
        taxAmount: tax,
        totalAmount: total,
        memo: data.memo ?? null,
        terms: data.terms ?? null,
        items: { create: items },
      },
      include: { items: true, customer: true, supplier: true },
    });
  });

  return NextResponse.json(quotation);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.quotation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
