import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      asset: true,
      customer: true,
      orders: { select: { id: true, orderNo: true, totalAmount: true, paymentMethod: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!rental) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  // 연체 자동 전환
  if (rental.status === "ACTIVE" && rental.endDate < new Date()) {
    await prisma.rental.update({ where: { id }, data: { status: "OVERDUE" } });
    rental.status = "OVERDUE";
  }
  return NextResponse.json(rental);
}
