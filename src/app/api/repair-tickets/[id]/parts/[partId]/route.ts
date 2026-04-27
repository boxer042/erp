import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; partId: string }> }
) {
  const { partId } = await params;
  const part = await prisma.repairPart.findUnique({ where: { id: partId } });
  if (!part) return NextResponse.json({ error: "찾을 수 없음" }, { status: 404 });
  if (part.consumedAt) {
    return NextResponse.json({ error: "이미 재고가 차감된 부품은 삭제할 수 없습니다" }, { status: 400 });
  }
  await prisma.repairPart.delete({ where: { id: partId } });
  return NextResponse.json({ success: true });
}
