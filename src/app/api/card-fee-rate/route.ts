import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const all = await prisma.cardFeeRate.findMany({
    orderBy: { appliedFrom: "desc" },
  });

  const now = new Date();
  const current = all.find((r) => r.appliedFrom <= now) ?? null;

  return NextResponse.json({ current, history: all });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const { rate, memo, appliedFrom } = body;

  if (!rate || !appliedFrom) {
    return NextResponse.json({ error: "수수료율과 적용일은 필수입니다" }, { status: 400 });
  }

  const rateNum = parseFloat(rate);
  if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
    return NextResponse.json({ error: "수수료율은 0~1 사이 소수로 입력하세요 (예: 0.032)" }, { status: 400 });
  }

  const created = await prisma.cardFeeRate.create({
    data: {
      rate: rateNum,
      memo: memo || null,
      appliedFrom: new Date(appliedFrom),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
