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

const createSchema = z.object({
  category: z.enum(MANUAL_BALANCE_CATEGORIES),
  label: z.string().min(1, "항목명을 입력해주세요"),
  amount: z
    .string()
    .min(1, "금액을 입력해주세요")
    .refine((v) => !isNaN(parseFloat(v)), "유효한 금액이 아닙니다"),
  memo: z.string().optional(),
});

export async function GET() {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const entries = await prisma.manualBalanceEntry.findMany({
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await prisma.manualBalanceEntry.create({
    data: {
      category: parsed.data.category,
      label: parsed.data.label,
      amount: parseFloat(parsed.data.amount),
      memo: parsed.data.memo || null,
    },
  });
  return NextResponse.json(entry, { status: 201 });
}
