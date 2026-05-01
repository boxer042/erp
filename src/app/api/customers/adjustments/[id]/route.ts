import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import { guardAdmin } from "@/lib/api-auth";

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
  const ledger = await prisma.customerLedger.findUnique({
    where: { id },
    include: { customer: { select: { id: true, name: true } } },
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
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.customerLedger.findUnique({ where: { id } });
  if (!existing || existing.referenceType !== "MANUAL_ADJUSTMENT") {
    return NextResponse.json({ error: "조정 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const date = new Date(data.date);

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.update({
      where: { id },
      data: {
        date,
        debitAmount: amount > 0 ? amount : 0,
        creditAmount: amount < 0 ? -amount : 0,
        description: data.memo
          ? `조정 — ${data.memo}`
          : amount > 0 ? "조정 (미수 증가)" : "조정 (미수 감소)",
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
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const existing = await prisma.customerLedger.findUnique({ where: { id } });
  if (!existing || existing.referenceType !== "MANUAL_ADJUSTMENT") {
    return NextResponse.json({ error: "조정 항목을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.delete({ where: { id } });
    await rebalanceCustomerLedger(tx, existing.customerId);
  });

  return NextResponse.json({ success: true });
}
