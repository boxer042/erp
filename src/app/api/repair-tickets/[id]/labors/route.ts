import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairLaborSchema } from "@/lib/validators/repair-ticket";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = repairLaborSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, hours, unitRate } = parsed.data;

  const ticket = await prisma.repairTicket.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 공임을 추가할 수 없습니다" },
      { status: 400 },
    );
  }

  const labor = await prisma.repairLabor.create({
    data: {
      repairTicketId: id,
      name: name.trim(),
      hours,
      unitRate,
      totalPrice: hours * unitRate,
    },
  });
  return NextResponse.json(labor, { status: 201 });
}
