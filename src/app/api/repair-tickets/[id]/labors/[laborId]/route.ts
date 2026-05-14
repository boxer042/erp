import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { repairLaborSchema } from "@/lib/validators/repair-ticket";
import {
  applyUsageDelta,
  snapshotTicketUsage,
  updateLaborUsageRate,
} from "@/lib/repair-diagnosis-usage";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; laborId: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { laborId } = await params;
  const body = await request.json();
  const parsed = repairLaborSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const labor = await prisma.repairLabor.findUnique({
    where: { id: laborId },
    include: { repairTicket: { select: { id: true, status: true, diagnosisTemplateId: true } } },
  });
  if (!labor) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (
    labor.repairTicket.status === "PICKED_UP" ||
    labor.repairTicket.status === "CANCELLED"
  ) {
    return NextResponse.json(
      { error: "완료/취소된 수리는 수정할 수 없습니다" },
      { status: 400 },
    );
  }

  const newName = data.name?.trim() ?? labor.name;
  const newHours = data.hours ?? Number(labor.hours);
  const newRate = data.unitRate ?? Number(labor.unitRate);

  const updated = await prisma.$transaction(async (tx) => {
    const before = await snapshotTicketUsage(tx, labor.repairTicket.id);
    const u = await tx.repairLabor.update({
      where: { id: laborId },
      data: {
        name: newName,
        hours: newHours,
        unitRate: newRate,
        totalPrice: newHours * newRate,
      },
    });
    // name 이 바뀌면 set 이 바뀜 → delta 적용
    const after = await snapshotTicketUsage(tx, labor.repairTicket.id);
    await applyUsageDelta(tx, before, after);
    // unitRate 가 바뀌었으면 추천 단가 갱신
    if (labor.repairTicket.diagnosisTemplateId && newRate !== Number(labor.unitRate)) {
      await updateLaborUsageRate(
        tx,
        labor.repairTicket.diagnosisTemplateId,
        newName,
        newRate,
      );
    }
    return u;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; laborId: string }> }
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { laborId } = await params;
  const labor = await prisma.repairLabor.findUnique({
    where: { id: laborId },
    include: { repairTicket: { select: { id: true, status: true } } },
  });
  if (!labor) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (
    labor.repairTicket.status === "PICKED_UP" ||
    labor.repairTicket.status === "CANCELLED"
  ) {
    return NextResponse.json(
      { error: "완료/취소된 수리는 공임을 삭제할 수 없습니다" },
      { status: 400 },
    );
  }
  await prisma.$transaction(async (tx) => {
    const before = await snapshotTicketUsage(tx, labor.repairTicket.id);
    await tx.repairLabor.delete({ where: { id: laborId } });
    const after = await snapshotTicketUsage(tx, labor.repairTicket.id);
    await applyUsageDelta(tx, before, after);
  });
  return NextResponse.json({ success: true });
}
