import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { rebalanceCustomerLedger } from "@/lib/customer-ledger";
import { guardAdmin } from "@/lib/api-auth";

const schema = z.object({
  customerId: z.string().min(1, "고객을 선택해주세요"),
  amount: z.string().min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) !== 0, "금액은 0이 아닌 값이어야 합니다"),
  date: z.string().min(1, "일자를 선택해주세요"),
  memo: z.string().optional(),
});

// 수동 조정(ADJUSTMENT) 등록
// amount > 0 → debit (미수금 증가), amount < 0 → credit (미수금 감소)
export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const amount = parseFloat(data.amount);
  const date = new Date(data.date);

  const result = await prisma.$transaction(async (tx) => {
    const lastLedger = await tx.customerLedger.findFirst({
      where: { customerId: data.customerId },
      orderBy: { createdAt: "desc" },
    });
    const prevBalance = lastLedger ? Number(lastLedger.balance) : 0;
    const newBalance = prevBalance + amount;

    const ledger = await tx.customerLedger.create({
      data: {
        customerId: data.customerId,
        date,
        type: "ADJUSTMENT",
        description: data.memo
          ? `조정 — ${data.memo}`
          : amount > 0 ? "조정 (미수 증가)" : "조정 (미수 감소)",
        debitAmount: amount > 0 ? amount : 0,
        creditAmount: amount < 0 ? -amount : 0,
        balance: newBalance,
        referenceType: "MANUAL_ADJUSTMENT",
      },
    });

    await rebalanceCustomerLedger(tx, data.customerId);

    return { ledger, newBalance };
  });

  return NextResponse.json(result, { status: 201 });
}
