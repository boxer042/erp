import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebalanceSupplierLedger } from "@/lib/supplier-ledger";
import { z } from "zod";

const updateSchema = z.object({
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) !== 0, "금액은 0이 아닌 값이어야 합니다"),
  date: z.string().min(1, "일자를 선택해주세요"),
  memo: z.string().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ledger = await prisma.supplierLedger.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
    },
  });
  if (!ledger || ledger.referenceType !== "MANUAL_ADJUSTMENT") {
    return NextResponse.json({ error: "조정 항목을 찾을 수 없습니다" }, { status: 404 });
  }
  return NextResponse.json(ledger);
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

  const existing = await prisma.supplierLedger.findUnique({ where: { id } });
  if (!existing || existing.referenceType !== "MANUAL_ADJUSTMENT") {
    return NextResponse.json({ error: "조정 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const date = new Date(data.date);

  await prisma.$transaction(async (tx) => {
    await tx.supplierLedger.update({
      where: { id },
      data: {
        date,
        debitAmount: amount > 0 ? amount : 0,
        creditAmount: amount < 0 ? -amount : 0,
        description: data.memo
          ? `조정 — ${data.memo}`
          : amount > 0 ? "조정 (미지급 증가)" : "조정 (미지급 감소)",
      },
    });
    await rebalanceSupplierLedger(tx, existing.supplierId);
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await prisma.supplierLedger.findUnique({ where: { id } });
  if (!existing || existing.referenceType !== "MANUAL_ADJUSTMENT") {
    return NextResponse.json({ error: "조정 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplierLedger.delete({ where: { id } });
    await rebalanceSupplierLedger(tx, existing.supplierId);
  });

  return NextResponse.json({ success: true });
}
