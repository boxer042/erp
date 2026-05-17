import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { z } from "zod";

const MANUAL_BALANCE_CATEGORIES = [
  "CASH",
  "EQUIPMENT",
  "OTHER_ASSET",
  "LOAN",
  "OTHER_LIABILITY",
  "CAPITAL",
  "RETAINED_EARNINGS",
] as const;

const updateSchema = z.object({
  category: z.enum(MANUAL_BALANCE_CATEGORIES),
  label: z.string().min(1, "항목명을 입력해주세요"),
  amount: z
    .string()
    .min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)), "유효한 금액이 아닙니다"),
  memo: z.string().optional(),
});

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

  const existing = await prisma.manualBalanceEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "항목을 찾을 수 없습니다" }, { status: 404 });
  }

  const entry = await prisma.manualBalanceEntry.update({
    where: { id },
    data: {
      category: parsed.data.category,
      label: parsed.data.label,
      amount: parseFloat(parsed.data.amount),
      memo: parsed.data.memo || null,
    },
  });
  return NextResponse.json(entry);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const { id } = await params;
  const existing = await prisma.manualBalanceEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "항목을 찾을 수 없습니다" }, { status: 404 });
  }

  await prisma.manualBalanceEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
