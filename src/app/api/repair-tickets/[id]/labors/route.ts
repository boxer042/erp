import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairLaborSchema } from "@/lib/validators/repair-ticket";
import {
  applyUsageDelta,
  snapshotTicketUsage,
  updateLaborUsageRate,
} from "@/lib/repair-diagnosis-usage";

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
    select: { status: true, diagnosisTemplateId: true },
  });
  if (!ticket) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (ticket.status === "PICKED_UP" || ticket.status === "CANCELLED") {
    return NextResponse.json(
      { error: "완료/취소된 수리는 공임을 추가할 수 없습니다" },
      { status: 400 },
    );
  }

  const trimmedName = name.trim();

  const labor = await prisma.$transaction(async (tx) => {
    const before = await snapshotTicketUsage(tx, id);
    const created = await tx.repairLabor.create({
      data: {
        repairTicketId: id,
        name: trimmedName,
        hours,
        unitRate,
        totalPrice: hours * unitRate,
      },
    });
    // set 변화 (같은 name 이 이미 있으면 set 안 바뀜 → 카운트 안 올라감)
    const after = await snapshotTicketUsage(tx, id);
    await applyUsageDelta(tx, before, after);
    // 단가는 최신값으로 갱신 (set 변화 없어도 추천 단가는 갱신 가치 있음)
    if (ticket.diagnosisTemplateId) {
      await updateLaborUsageRate(
        tx,
        ticket.diagnosisTemplateId,
        trimmedName,
        unitRate,
      );
    }
    return created;
  });

  return NextResponse.json(labor, { status: 201 });
}
