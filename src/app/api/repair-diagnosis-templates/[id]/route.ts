import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

const updateSchema = z.object({
  text: z.string().min(1).max(200).optional(),
});

/**
 * 진단 템플릿 수정 — text 만 변경 가능. 연결된 RepairTicket.diagnosis 텍스트도 동기화.
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

  const tpl = await prisma.repairDiagnosisTemplate.findUnique({ where: { id } });
  if (!tpl) {
    return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  }

  const conflict = tpl.categoryId
    ? await prisma.repairDiagnosisTemplate.findUnique({
        where: { categoryId_text: { categoryId: tpl.categoryId, text: newText } },
      })
    : await prisma.repairDiagnosisTemplate.findFirst({
        where: { categoryId: null, text: newText },
      });
  if (conflict && conflict.id !== id) {
    return NextResponse.json(
      { error: "같은 카테고리에 이미 같은 텍스트가 있습니다. 병합이 필요합니다." },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.repairDiagnosisTemplate.update({
      where: { id },
      data: { text: newText },
    });
    await tx.repairTicket.updateMany({
      where: { diagnosisTemplateId: id },
      data: { diagnosis: newText },
    });
  });

  return NextResponse.json({ success: true });
}

/**
 * 진단 템플릿 삭제 — onDelete: SetNull 로 RepairTicket.diagnosisTemplateId 자동 null.
 * SymptomDiagnosisLink / DiagnosisPartUsage / DiagnosisLaborUsage / DiagnosisPartSet 모두 cascade 삭제.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { id } = await params;
  await prisma.repairDiagnosisTemplate.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
