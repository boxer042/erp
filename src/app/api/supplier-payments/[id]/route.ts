import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierPaymentUpdateSchema } from "@/lib/validators/supplier";
import { rebalanceSupplierLedger, recomputeIncomingPaymentStatus } from "@/lib/supplier-ledger";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payment = await prisma.supplierPayment.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, paymentMethod: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!payment) {
    return NextResponse.json({ error: "결제를 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(payment);
}

// 결제 수정 — 금액/일자/방식/메모 변경 가능. 거래처는 변경 불가 (원장 재배정 복잡도)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = supplierPaymentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.supplierPayment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "결제를 찾을 수 없습니다" }, { status: 404 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const paymentDate = new Date(data.paymentDate);

  await prisma.$transaction(async (tx) => {
    // SupplierPayment 업데이트
    await tx.supplierPayment.update({
      where: { id },
      data: {
        amount,
        paymentDate,
        method: data.method,
        kind: data.kind,
        memo: data.memo || null,
      },
    });

    // 대응하는 원장 항목 업데이트
    await tx.supplierLedger.updateMany({
      where: { referenceId: id, referenceType: "SUPPLIER_PAYMENT" },
      data: {
        date: paymentDate,
        creditAmount: amount,
        description: data.memo ? `결제 — ${data.memo}` : "결제",
      },
    });

    // balance 재계산
    await rebalanceSupplierLedger(tx, existing.supplierId);
    // 결제 금액 변경 시 입고 PAID/UNPAID 재매칭
    await recomputeIncomingPaymentStatus(tx, existing.supplierId);

    const auditUser = await getCurrentUser();
    await recordAudit(tx, {
      userId: auditUser?.id ?? null,
      entity: "SupplierPayment",
      entityId: id,
      action: "UPDATE",
      meta: {
        supplierId: existing.supplierId,
        oldAmount: Number(existing.amount),
        newAmount: amount,
        paymentDate: data.paymentDate,
      },
    });
  });

  return NextResponse.json({ success: true });
}

// 결제 삭제 — 원장 항목 삭제 + balance 재계산
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await prisma.supplierPayment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "결제를 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplierLedger.deleteMany({
      where: { referenceId: id, referenceType: "SUPPLIER_PAYMENT" },
    });
    await tx.supplierPayment.delete({ where: { id } });
    await rebalanceSupplierLedger(tx, existing.supplierId);
    // 결제 삭제 시 매칭됐던 입고 PAID 를 잔여 결제 합계 기준으로 재계산 (UNPAID 로 되돌릴 수 있음)
    await recomputeIncomingPaymentStatus(tx, existing.supplierId);

    const auditUser = await getCurrentUser();
    await recordAudit(tx, {
      userId: auditUser?.id ?? null,
      entity: "SupplierPayment",
      entityId: id,
      action: "DELETE",
      meta: { supplierId: existing.supplierId, amount: Number(existing.amount) },
    });
  });

  return NextResponse.json({ success: true });
}
