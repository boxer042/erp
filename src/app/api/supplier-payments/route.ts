import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { supplierPaymentSchema } from "@/lib/validators/supplier";
import { rebalanceSupplierLedger, recomputeIncomingPaymentStatus } from "@/lib/supplier-ledger";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supplierId = searchParams.get("supplierId");
  const method = searchParams.get("method");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const payments = await prisma.supplierPayment.findMany({
    where: {
      ...(supplierId ? { supplierId } : {}),
      ...(method ? { method } : {}),
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
      supplier: { select: { id: true, name: true, paymentMethod: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 500,
  });

  return NextResponse.json(payments);
}

// 결제 등록 + 거래처 원장(PAYMENT) 기록
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = supplierPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const paymentDate = new Date(data.paymentDate);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.create({
      data: {
        supplierId: data.supplierId,
        amount,
        paymentDate,
        method: data.method,
        kind: data.kind,
        memo: data.memo || null,
        createdById: user.id,
      },
    });

    // 거래처 원장 PAYMENT — 미지급금 차감 (credit)
    const lastLedger = await tx.supplierLedger.findFirst({
      where: { supplierId: data.supplierId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    const newBalance = prevBalance - amount;

    await tx.supplierLedger.create({
      data: {
        supplierId: data.supplierId,
        date: paymentDate,
        type: "PAYMENT",
        description: data.memo
          ? `결제 — ${data.memo}`
          : "결제",
        debitAmount: 0,
        creditAmount: amount,
        balance: newBalance,
        referenceId: payment.id,
        referenceType: "SUPPLIER_PAYMENT",
      },
    });

    // 백-입력(과거 일자로 결제)된 경우에도 잔액 컬럼을 정리
    await rebalanceSupplierLedger(tx, data.supplierId);

    // FIFO 자동 매칭 — 입고 paymentStatus 를 결제 합계 기준으로 재계산
    const matchResult = await recomputeIncomingPaymentStatus(tx, data.supplierId);

    await recordAudit(tx, {
      userId: user.id,
      entity: "SupplierPayment",
      entityId: payment.id,
      action: "CREATE",
      meta: {
        supplierId: data.supplierId,
        amount,
        method: data.method,
        paymentDate: data.paymentDate,
        paidIncomings: matchResult.paidCount,
        totalIncomings: matchResult.totalCount,
      },
    });

    return { payment, newBalance, autoMatchedIncomings: matchResult.paidCount };
  });

  return NextResponse.json(result, { status: 201 });
}
