import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";
import { SUPPLIER_PAYMENT_METHODS, PAYMENT_KIND } from "@/lib/validators/supplier";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import { recordAudit } from "@/lib/audit";

const customerPaymentSchema = z.object({
  customerId: z.string().min(1, "고객을 선택해주세요"),
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "금액은 0보다 커야 합니다"),
  paymentDate: z.string().min(1, "수금일을 선택해주세요"),
  method: z.enum(SUPPLIER_PAYMENT_METHODS),
  kind: z.enum(PAYMENT_KIND).default("MIXED"),
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
        kind: data.kind,
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

    // FIFO 자동 매칭 — UNPAID 주문(외상)을 orderDate 오름차순으로 입금액만큼 PAID 처리.
    // 단순화: 주문 단위 fully paid 만 (각 주문의 totalAmount 보다 입금액이 크거나 같아야 PAID).
    // 부분 매칭은 customer 잔액에 반영되어 있으니 다음 입금에서 처리됨.
    const unpaidOrders = await tx.order.findMany({
      where: {
        customerId: data.customerId,
        paymentStatus: "UNPAID",
        // 종결되지 않은 활성 주문만 (취소·반품된 외상은 환불 대상 아님)
        status: {
          notIn: ["CANCELLED", "RETURNED", "EXCHANGED"],
        },
      },
      select: { id: true, orderNo: true, totalAmount: true },
      orderBy: { orderDate: "asc" },
    });
    let remaining = amount;
    const paidOrderIds: string[] = [];
    for (const o of unpaidOrders) {
      const orderAmount = Number(o.totalAmount);
      if (remaining + 0.01 < orderAmount) break; // 잔액 부족 — 다음 주문 처리 안 함
      remaining -= orderAmount;
      paidOrderIds.push(o.id);
    }
    if (paidOrderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: paidOrderIds } },
        data: { paymentStatus: "PAID" },
      });
    }

    await recordAudit(tx, {
      userId: user.id,
      entity: "CustomerPayment",
      entityId: payment.id,
      action: "CREATE",
      meta: {
        customerId: data.customerId,
        amount,
        method: data.method,
        paymentDate: data.paymentDate,
        autoMatchedOrderIds: paidOrderIds,
      },
    });

    return { payment, newBalance, autoMatchedOrders: paidOrderIds.length };
  });

  return NextResponse.json(result, { status: 201 });
}
