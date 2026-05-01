import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { cardCompanyFeeSchema } from "@/lib/validators/card-company-fee";
import { recomputeCurrentCardFeeRate } from "@/lib/card-fee-rate-helper";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = cardCompanyFeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.cardCompanyFee.update({
      where: { id },
      data: {
        companyName: d.companyName,
        merchantNo: d.merchantNo ?? null,
        settlementBank: d.settlementBank ?? null,
        settlementAccount: d.settlementAccount ?? null,
        creditRate: d.creditRate,
        checkBankRate: d.checkBankRate ?? null,
        checkSpecialRate: d.checkSpecialRate ?? null,
        paymentDays: d.paymentDays ?? null,
        ...(d.sortOrder !== undefined ? { sortOrder: d.sortOrder } : {}),
      },
    });
    await recomputeCurrentCardFeeRate(tx);
    return row;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    await tx.cardCompanyFee.delete({ where: { id } });
    await recomputeCurrentCardFeeRate(tx);
  });
  return NextResponse.json({ ok: true });
}
