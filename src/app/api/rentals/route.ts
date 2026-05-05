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
  const assetId = request.nextUrl.searchParams.get("assetId");

  await refreshOverdue();

  const rentals = await prisma.rental.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(customerId ? { customerId } : {}),
      ...(assetId ? { assetId } : {}),
    },
    include: {
      asset: {
        select: {
          id: true,
          assetNo: true,
          name: true,
          dailyRate: true,
          depositAmount: true,
        },
      },
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
  if (asset.status === "RETIRED" || asset.status === "MAINTENANCE") {
    return NextResponse.json(
      { error: "해당 자산은 대여 불가 상태입니다 (정비/폐기)" },
      { status: 400 },
    );
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start)
    return NextResponse.json(
      { error: "반납일은 시작일 이후여야 합니다" },
      { status: 400 },
    );

  const totalUnits = diffUnits(rateType, start, end);
  const rentalAmount = totalUnits * Number(unitRate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isActiveNow = start <= today;

  // 트랜잭션 내부에서 점유 중복 검사 + 생성. 클라이언트 검증을 우회한 동시 요청도 차단.
  // 완전한 race-free 보장을 위해 같은 자산 행에 advisory-lock 효과를 주는 update 를 함께 수행.
  // (PostgreSQL 행 잠금 — `updatedAt` 만 갱신해도 같은 행에 대한 동시 트랜잭션 직렬화)
  let rental;
  try {
    rental = await prisma.$transaction(async (tx) => {
      // 같은 자산 행 잠금 — 같은 자산에 대한 다른 동시 트랜잭션이 commit 될 때까지 대기
      await tx.rentalAsset.update({
        where: { id: assetId },
        data: { updatedAt: new Date() },
      });

      // 점유 검사: ACTIVE / OVERDUE / RESERVED 중 [start, end] 와 겹치는 것이 있으면 차단
      const conflict = await tx.rental.findFirst({
        where: {
          assetId,
          status: { in: ["ACTIVE", "OVERDUE", "RESERVED"] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: {
          id: true,
          rentalNo: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });
      if (conflict) {
        const e = new Error("OVERLAP");
        // 호출부에서 conflict 정보까지 401 응답으로 사용하도록 첨부
        (e as Error & { conflict?: typeof conflict }).conflict = conflict;
        throw e;
      }

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
      // 자산 상태 변경 — 새 임대가 ACTIVE 일 때만 RENTED 로
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
  } catch (e) {
    if (e instanceof Error && e.message === "OVERLAP") {
      const conflict = (e as Error & {
        conflict?: {
          id: string;
          rentalNo: string;
          status: string;
          startDate: Date;
          endDate: Date;
        };
      }).conflict;
      return NextResponse.json(
        {
          error: "선택한 기간이 기존 임대와 겹칩니다",
          conflict,
        },
        { status: 409 },
      );
    }
    throw e;
  }

  return NextResponse.json(rental, { status: 201 });
}
