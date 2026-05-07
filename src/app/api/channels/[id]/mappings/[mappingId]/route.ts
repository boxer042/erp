/**
 * DELETE /api/channels/[id]/mappings/[mappingId] — 매핑 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; mappingId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const { id: channelId, mappingId } = await params;
  const mapping = await prisma.channelProductMapping.findUnique({
    where: { id: mappingId },
    select: { id: true, channelId: true },
  });
  if (!mapping || mapping.channelId !== channelId) {
    return NextResponse.json(
      { error: "매핑을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  await prisma.channelProductMapping.delete({ where: { id: mappingId } });
  return NextResponse.json({ success: true });
}
