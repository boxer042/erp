import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { SUPPLIER_PAYMENT_METHODS } from "@/lib/validators/supplier";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";

const customerPaymentSchema = z.object({
  customerId: z.string().min(1, "고객을 선택해주세요"),
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  paymentDate: z.string().min(1, "수금일을 선택해주세요"),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  memo: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const payments = await prisma.customerPayment.findMany({
    where: {
      ...(customerId ? { customerId } : {}),
      ...(from || to
        ? {
            paymentDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lt: new Date(to) } : {}),
            },
          }
        : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 500,
  });

  return NextResponse.json(payments);
}

// 수금 등록 + 고객 원장(RECEIPT) 기록
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = customerPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const paymentDate = new Date(data.paymentDate);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.customerPayment.create({
      data: {
        customerId: data.customerId,
        amount,
        paymentDate,
        method: data.method,
        memo: data.memo || null,
        createdById: user.id,
      },
    });

    const lastLedger = await tx.customerLedger.findFirst({
      where: { customerId: data.customerId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    const newBalance = prevBalance - amount;

    await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        date: paymentDate,
        type: "RECEIPT",
        description: data.memo ? `수금 — ${data.memo}` : "수금",
        debitAmount: 0,
        creditAmount: amount,
        balance: newBalance,
        referenceId: payment.id,
        referenceType: "CUSTOMER_PAYMENT",
      },
    });

    await rebalanceCustomerLedger(tx, data.customerId);

    return { payment, newBalance };
  });

  return NextResponse.json(result, { status: 201 });
}
