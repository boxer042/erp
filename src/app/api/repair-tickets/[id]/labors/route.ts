import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { name, hours, unitRate } = body ?? {};
  if (!name?.trim() || !unitRate) {
    return NextResponse.json({ error: "name, unitRate 필수" }, { status: 400 });
  }
  const h = Number(hours) || 1;
  const rate = Number(unitRate);
  const labor = await prisma.repairLabor.create({
    data: {
      repairTicketId: id,
      name: name.trim(),
      hours: h,
      unitRate: rate,
      totalPrice: h * rate,
    },
  });
  return NextResponse.json(labor, { status: 201 });
}
