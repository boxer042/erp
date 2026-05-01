import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";
import { cardCompanyFeeSchema } from "@/lib/validators/card-company-fee";

export async function GET() {
  const [merchant, items] = await Promise.all([
    prisma.cardMerchantInfo.findUnique({ where: { id: "singleton" } }),
    prisma.cardCompanyFee.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return NextResponse.json({ merchant, items });
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const parsed = cardCompanyFeeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const last = await prisma.cardCompanyFee.findFirst({
    orderBy: { sortOrder: "desc" },
  });
  const nextSort = d.sortOrder ?? (last ? last.sortOrder + 1 : 0);

  const created = await prisma.cardCompanyFee.create({
    data: {
      companyName: d.companyName,
      merchantNo: d.merchantNo ?? null,
      settlementBank: d.settlementBank ?? null,
      settlementAccount: d.settlementAccount ?? null,
      creditRate: d.creditRate,
      checkBankRate: d.checkBankRate ?? null,
      checkSpecialRate: d.checkSpecialRate ?? null,
      paymentDays: d.paymentDays ?? null,
      sortOrder: nextSort,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
