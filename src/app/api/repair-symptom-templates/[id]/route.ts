import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

const updateSchema = z.object({
  text: z.string().min(1).max(200).optional(),
});

/**
 * 증상 템플릿 수정 — text 만 변경 가능. (categoryId, text) unique 충돌 시 409.
 * 연결된 RepairTicket 들의 symptom 텍스트도 같이 동기화.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.text === undefined) {
    return NextResponse.json({ error: "변경할 필드 없음" }, { status: 400 });
  }
  const newText = parsed.data.text.trim();

  const tpl = await prisma.repairSymptomTemplate.findUnique({ where: { id } });
  if (!tpl) {
    return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  }

  // 같은 카테고리 안에 같은 text 중복 체크
  const conflict = tpl.categoryId
    ? await prisma.repairSymptomTemplate.findUnique({
        where: { categoryId_text: { categoryId: tpl.categoryId, text: newText } },
      })
    : await prisma.repairSymptomTemplate.findFirst({
        where: { categoryId: null, text: newText },
      });
  if (conflict && conflict.id !== id) {
    return NextResponse.json(
      { error: "같은 카테고리에 이미 같은 텍스트가 있습니다. 병합이 필요합니다." },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.repairSymptomTemplate.update({
      where: { id },
      data: { text: newText },
    });
    // 연결된 모든 ticket 의 symptom 텍스트도 동기화 (RepairTicket.symptom 은 display 본문)
    await tx.repairTicket.updateMany({
      where: { symptomTemplateId: id },
      data: { symptom: newText },
    });
  });

  return NextResponse.json({ success: true });
}

/**
 * 증상 템플릿 삭제 — onDelete: SetNull 로 RepairTicket.symptomTemplateId 자동 null.
 * RepairTicket.symptom 텍스트는 그대로 보존 (이력 유지).
 * SymptomDiagnosisLink 는 cascade 삭제.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  await prisma.repairSymptomTemplate.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
