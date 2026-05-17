import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { generateAccessToken } from "@/lib/serial-token";

// POST /api/serial-items/[code]/regenerate-token
// 라벨 분실·재발급 시 새 출입증 토큰 발급. 이전 토큰 URL 은 즉시 무효(덮어쓰기).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { code } = await params;

  const existing = await prisma.serialItem.findUnique({
    where: { code },
    select: { id: true, accessToken: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "시리얼을 찾을 수 없습니다" }, { status: 404 });
  }

  const newToken = generateAccessToken();
  await prisma.serialItem.update({
    where: { code },
    data: { accessToken: newToken, accessTokenRevokedAt: null },
  });

  await recordAudit(prisma, {
    userId: user.id,
    entity: "SerialItem",
    entityId: existing.id,
    action: "UPDATE",
    meta: { regeneratedToken: true },
  });

  return NextResponse.json({ accessToken: newToken });
}
