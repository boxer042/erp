import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supplierPaymentUpdateSchema } from "@/lib/validators/supplier";
import { rebalanceSupplierLedger } from "@/lib/supplier-ledger";

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
  });

  return NextResponse.json({ success: true });
}
