import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assemblySlotLabelSchema } from "@/lib/validators/assembly-template";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = assemblySlotLabelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const label = await prisma.$transaction(async (tx) => {
      const updated = await tx.assemblySlotLabel.update({
        where: { id },
        data: { name: data.name, isActive: data.isActive ?? true },
      });
      // 사용 중인 슬롯의 label 캐시도 일괄 동기화
      await tx.assemblyTemplateSlot.updateMany({
        where: { slotLabelId: id },
        data: { label: data.name },
      });
      return updated;
    });
    return NextResponse.json(label);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "이미 등록된 라벨명입니다" },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "라벨 수정 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const usage = await prisma.assemblyTemplateSlot.count({
    where: { slotLabelId: id },
  });
  if (usage > 0) {
    return NextResponse.json(
      { error: `사용 중인 라벨입니다 (${usage}개 슬롯). 비활성화로 처리해주세요.` },
      { status: 409 },
    );
  }
  try {
    await prisma.assemblySlotLabel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "라벨 삭제 실패";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
