import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function genRentalNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RNT${y}${m}${d}-${r}`;
}

async function refreshOverdue(rentalId?: string) {
  const now = new Date();
  await prisma.rental.updateMany({
    where: {
      ...(rentalId ? { id: rentalId } : {}),
      status: { in: ["ACTIVE"] },
      endDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const customerId = request.nextUrl.searchParams.get("customerId");

  await refreshOverdue();

  const rentals = await prisma.rental.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(customerId ? { customerId } : {}),
    },
    include: {
      asset: { select: { id: true, assetNo: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(rentals);
}

function diffUnits(rateType: "DAILY" | "MONTHLY", start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  const days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  if (rateType === "DAILY") return days;
  return Math.max(1, Math.ceil(days / 30));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const {
    assetId, customerId, startDate, endDate, rateType, unitRate,
    depositAmount, paymentMethod, memo,
  } = body ?? {};
  if (!assetId || !customerId || !startDate || !endDate || !rateType || !unitRate) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }

  const asset = await prisma.rentalAsset.findUnique({ where: { id: assetId } });
  if (!asset) return NextResponse.json({ error: "자산 없음" }, { status: 404 });
  if (asset.status !== "AVAILABLE") {
    return NextResponse.json({ error: "해당 자산은 대여 불가 상태입니다" }, { status: 400 });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return NextResponse.json({ error: "반납일은 시작일 이후여야 합니다" }, { status: 400 });

  const totalUnits = diffUnits(rateType, start, end);
  const rentalAmount = totalUnits * Number(unitRate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isActiveNow = start <= today;

  const rental = await prisma.$transaction(async (tx) => {
    const r = await tx.rental.create({
      data: {
        rentalNo: genRentalNo(),
        assetId,
        customerId,
        status: isActiveNow ? "ACTIVE" : "RESERVED",
        startDate: start,
        endDate: end,
        rateType,
        unitRate: Number(unitRate),
        totalUnits,
        rentalAmount,
        depositAmount: depositAmount ? Number(depositAmount) : 0,
        finalAmount: rentalAmount,
        paymentMethod: paymentMethod ?? null,
        memo: memo?.trim() || null,
        createdById: user.id,
      },
    });
    // 자산 상태 변경
    await tx.rentalAsset.update({
      where: { id: assetId },
      data: { status: isActiveNow ? "RENTED" : asset.status },
    });
    // UNPAID이면 고객원장 기록
    if (paymentMethod === "UNPAID") {
      const last = await tx.customerLedger.findFirst({
        where: { customerId },
        orderBy: { date: "desc" },
      });
      const prev = last ? Number(last.balance) : 0;
      await tx.customerLedger.create({
        data: {
          customerId,
          type: "SALE",
          description: `임대 ${r.rentalNo}`,
          debitAmount: rentalAmount,
          creditAmount: 0,
          balance: prev + rentalAmount,
          referenceId: r.id,
          referenceType: "RENTAL",
        },
      });
    }
    return r;
  });

  return NextResponse.json(rental, { status: 201 });
}
