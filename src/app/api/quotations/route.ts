import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { quotationSchema } from "@/lib/validators/quotation";
import { requireAuth } from "@/lib/auth";
import { generateQuotationNo } from "@/lib/document-no";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search") || "";

  const where: Prisma.QuotationWhereInput = {
    ...(type ? { type: type as "SALES" | "PURCHASE" } : {}),
    ...(status
      ? { status: status as "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED" }
      : {}),
    ...(search
      ? {
          OR: [
            { quotationNo: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
            { customer: { name: { contains: search, mode: "insensitive" as const } } },
            { supplier: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const quotations = await prisma.quotation.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      supplier: { select: { id: true, name: true, businessNumber: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(quotations);
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
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

  const quotation = await prisma.quotation.create({
    data: {
      quotationNo: generateQuotationNo(),
      type: data.type,
      status: data.status,
      issueDate: new Date(data.issueDate),
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      customerId: data.type === "SALES" ? data.customerId || null : null,
      supplierId: data.type === "PURCHASE" ? data.supplierId || null : null,
      title: data.title || null,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount: total,
      memo: data.memo || null,
      terms: data.terms || null,
      createdById: user.id,
      items: { create: items },
    },
    include: {
      items: true,
      customer: true,
      supplier: true,
    },
  });

  return NextResponse.json(quotation, { status: 201 });
}
