import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;

  const body = await request.json();
  const appliedFrom = body?.appliedFrom ? new Date(body.appliedFrom) : new Date();
  const memo: string | null = body?.memo ?? null;

  const items = await prisma.cardCompanyFee.findMany({
    where: { isActive: true },
    select: { creditRate: true },
  });
  if (items.length === 0) {
    return NextResponse.json(
      { error: "등록된 카드사가 없습니다. 카드사별 수수료를 먼저 등록하세요." },
      { status: 400 },
    );
  }

  // 신용카드율만의 산술평균
  const sum = items.reduce((acc, it) => acc + Number(it.creditRate), 0);
  const avg = sum / items.length;

  const created = await prisma.$transaction(async (tx) => {
    const rate = await tx.cardFeeRate.create({
      data: {
        rate: avg,
        memo,
        appliedFrom,
      },
    });
    await tx.cardMerchantInfo.upsert({
      where: { id: "singleton" },
      update: { appliedFrom },
      create: { id: "singleton", appliedFrom },
    });
    return rate;
  });

  return NextResponse.json(
    { rate: created, average: avg, count: items.length },
    { status: 201 },
  );
}
