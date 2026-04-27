import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/validators/supplier";

const updateSchema = z.object({
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  paymentDate: z.string().min(1, "수금일을 선택해주세요"),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  memo: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payment = await prisma.customerPayment.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!payment) {
    return NextResponse.json({ error: "수금을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(payment);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.customerPayment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "수금을 찾을 수 없습니다" }, { status: 404 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const paymentDate = new Date(data.paymentDate);

  await prisma.$transaction(async (tx) => {
    await tx.customerPayment.update({
      where: { id },
      data: {
        amount,
        paymentDate,
        method: data.method,
        memo: data.memo || null,
      },
    });

    await tx.customerLedger.updateMany({
      where: { referenceId: id, referenceType: "CUSTOMER_PAYMENT" },
      data: {
        date: paymentDate,
        creditAmount: amount,
        description: data.memo ? `수금 — ${data.memo}` : "수금",
      },
    });

    await rebalanceCustomerLedger(tx, existing.customerId);
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await prisma.customerPayment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "수금을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.deleteMany({
      where: { referenceId: id, referenceType: "CUSTOMER_PAYMENT" },
    });
    await tx.customerPayment.delete({ where: { id } });
    await rebalanceCustomerLedger(tx, existing.customerId);
  });

  return NextResponse.json({ success: true });
}
