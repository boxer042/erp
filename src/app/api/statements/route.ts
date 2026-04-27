import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { statementSchema } from "@/lib/validators/statement";
import { requireAuth } from "@/lib/auth";
import { generateStatementNo } from "@/lib/document-no";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search") || "";

  const statements = await prisma.statement.findMany({
    where: {
      ...(status ? { status: status as "DRAFT" | "ISSUED" | "CANCELLED" } : {}),
      ...(search
        ? {
            OR: [
              { statementNo: { contains: search, mode: "insensitive" as const } },
              { customer: { name: { contains: search, mode: "insensitive" as const } } },
              { customerNameSnapshot: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      order: { select: { id: true, orderNo: true } },
      quotation: { select: { id: true, quotationNo: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(statements);
}

export async function POST(request: NextRequest) {
  const user = await requireAuth();
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

  // customerId가 있고 snapshot이 비었으면 자동 채움
  let nameSnap = data.customerNameSnapshot;
  let phoneSnap = data.customerPhoneSnapshot;
  let addrSnap = data.customerAddressSnapshot;
  let bizSnap = data.customerBusinessNumberSnapshot;
  if (data.customerId && (!nameSnap || !phoneSnap)) {
    const c = await prisma.customer.findUnique({ where: { id: data.customerId } });
    if (c) {
      nameSnap = nameSnap || c.name;
      phoneSnap = phoneSnap || c.phone;
      addrSnap = addrSnap || c.address || undefined;
      bizSnap = bizSnap || c.businessNumber || undefined;
    }
  }

  const statement = await prisma.statement.create({
    data: {
      statementNo: generateStatementNo(),
      status: data.status,
      issueDate: new Date(data.issueDate),
      customerId: data.customerId || null,
      customerNameSnapshot: nameSnap || null,
      customerPhoneSnapshot: phoneSnap || null,
      customerAddressSnapshot: addrSnap || null,
      customerBusinessNumberSnapshot: bizSnap || null,
      orderId: data.orderId || null,
      quotationId: data.quotationId || null,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount: total,
      memo: data.memo || null,
      createdById: user.id,
      items: { create: items },
    },
    include: { items: true, customer: true },
  });

  return NextResponse.json(statement, { status: 201 });
}
