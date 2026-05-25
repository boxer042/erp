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

    // FIFO 자동 매칭 — UNPAID(전액 외상) + PARTIAL_PAID(잔금 미수) 모두 처리.
    //   - UNPAID:        outstandingDue = totalAmount
    //   - PARTIAL_PAID:  outstandingDue = totalAmount - paidAmount  (잔금만)
    // 단순화: 주문 단위 fully paid 만 (outstandingDue 보다 입금액 ≥ 면 PAID 전이).
    // 부분 매칭(잔금의 일부만 수금)은 customer 잔액에 반영되어 있으니 다음 입금에서 처리됨.
    const candidates = await tx.order.findMany({
      where: {
        customerId: data.customerId,
        paymentStatus: { in: ["UNPAID", "PARTIAL_PAID"] },
        // 종결되지 않은 활성 주문만 (취소·반품된 외상은 환불 대상 아님)
        status: {
          notIn: ["CANCELLED", "RETURNED", "EXCHANGED"],
        },
      },
      select: {
        id: true,
        orderNo: true,
        totalAmount: true,
        paymentStatus: true,
        paidAmount: true,
      },
      orderBy: { orderDate: "asc" },
    });
    let remaining = amount;
    const paidOrderIds: string[] = [];
    for (const o of candidates) {
      const outstandingDue =
        o.paymentStatus === "PARTIAL_PAID" && o.paidAmount
          ? Math.max(0, Number(o.totalAmount) - Number(o.paidAmount))
          : Number(o.totalAmount);
      if (remaining + 0.01 < outstandingDue) break; // 잔액 부족 — 다음 주문 처리 안 함
      remaining -= outstandingDue;
      paidOrderIds.push(o.id);
    }
    if (paidOrderIds.length > 0) {
      // PAID 전이 — PARTIAL_PAID 였던 주문은 partial 메타 (paidAmount/partialPaymentKind)
      // 초기화. 이후 영수증 헤더가 "계약금 영수증" 으로 오라벨되지 않게 함.
      // 원본 부분 결제 이력은 CustomerLedger description + AuditLog 에 보존.
      await tx.order.updateMany({
        where: { id: { in: paidOrderIds } },
        data: {
          paymentStatus: "PAID",
          paidAmount: null,
          partialPaymentKind: null,
        },
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
