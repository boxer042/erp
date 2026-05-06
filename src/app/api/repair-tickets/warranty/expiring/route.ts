import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 수리 보증 만료 임박 + 이미 만료 — RepairTicket.repairWarrantyEnds 기준.
 * - PICKED_UP 만 (보증 시작 시점)
 * - 기본 30일 이내 (?days=30) + 이미 만료된 항목도 함께
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const days = Math.min(
    365,
    Math.max(1, parseInt(searchParams.get("days") || "30", 10) || 30),
  );

  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 86400000);

  const tickets = await prisma.repairTicket.findMany({
    where: {
      status: "PICKED_UP",
      repairWarrantyEnds: { not: null, lte: cutoff },
    },
    select: {
      id: true,
      ticketNo: true,
      pickedUpAt: true,
      repairWarrantyEnds: true,
      finalAmount: true,
      symptom: true,
      diagnosis: true,
      customer: { select: { id: true, name: true, phone: true } },
      repairProduct: { select: { id: true, name: true, sku: true } },
      repairProductText: true,
      repairCategory: { select: { name: true } },
    },
    orderBy: { repairWarrantyEnds: "asc" },
    take: 500,
  });

  const items = tickets.map((t) => {
    const ends = t.repairWarrantyEnds!.getTime();
    const diff = Math.floor((ends - now.getTime()) / 86400000);
    return {
      id: t.id,
      ticketNo: t.ticketNo,
      pickedUpAt: t.pickedUpAt?.toISOString() ?? null,
      warrantyEnds: t.repairWarrantyEnds!.toISOString(),
      daysLeft: diff, // 음수 = 이미 만료
      isExpired: diff < 0,
      finalAmount: Number(t.finalAmount),
      symptom: t.symptom,
      diagnosis: t.diagnosis,
      customerId: t.customer?.id ?? null,
      customerName: t.customer?.name ?? null,
      customerPhone: t.customer?.phone ?? null,
      productName: t.repairProduct?.name ?? t.repairProductText ?? "(미상)",
      productSku: t.repairProduct?.sku ?? null,
      categoryName: t.repairCategory?.name ?? null,
    };
  });

  const summary = {
    totalCount: items.length,
    expiredCount: items.filter((i) => i.isExpired).length,
    in7Count: items.filter((i) => !i.isExpired && i.daysLeft <= 7).length,
    in30Count: items.filter((i) => !i.isExpired && i.daysLeft <= 30).length,
  };

  return NextResponse.json({ items, summary });
}
