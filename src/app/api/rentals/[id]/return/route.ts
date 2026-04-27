import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { returnedAt, depositReturned, paymentMethod, extraAmount } = body ?? {};

  const rental = await prisma.rental.findUnique({ where: { id } });
  if (!rental) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (rental.status === "RETURNED" || rental.status === "CANCELLED") {
    return NextResponse.json({ error: "이미 종료된 임대입니다" }, { status: 400 });
  }

  const actualReturned = returnedAt ? new Date(returnedAt) : new Date();
  // 연체료 계산: 반납일이 예정 반납일 이후면 (일수 초과) × dailyRate
  let overdueAmount = 0;
  if (actualReturned > rental.endDate) {
    const overdueMs = actualReturned.getTime() - rental.endDate.getTime();
    const overdueDays = Math.ceil(overdueMs / (1000 * 60 * 60 * 24));
    // dailyRate는 자산에서 가져오거나 rental.unitRate가 DAILY인 경우 사용. 간단히 일할 계산:
    const dailyRate = rental.rateType === "DAILY" ? Number(rental.unitRate) : Number(rental.unitRate) / 30;
    overdueAmount = Math.round(overdueDays * dailyRate);
  }
  const extra = extraAmount ? Number(extraAmount) : 0;
  const finalAmount = Number(rental.rentalAmount) + overdueAmount + extra;

  await prisma.$transaction(async (tx) => {
    await tx.rental.update({
      where: { id },
      data: {
        status: "RETURNED",
        actualReturnedAt: actualReturned,
        overdueAmount,
        finalAmount,
        depositReturned: !!depositReturned,
        paymentMethod: paymentMethod ?? rental.paymentMethod ?? null,
      },
    });
    await tx.rentalAsset.update({
      where: { id: rental.assetId },
      data: { status: "AVAILABLE" },
    });
  });

  return NextResponse.json({ success: true, finalAmount, overdueAmount });
}
