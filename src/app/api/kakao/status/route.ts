import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { isKakaoConfigured } from "@/lib/notifications/kakao-memo";

// 현재 사용자의 카카오 알림 연결 상태.
export async function GET() {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  // env 미설정이면 DB 조회 없이 즉시 no-op 상태 반환
  if (!isKakaoConfigured()) {
    return NextResponse.json({ configured: false, connected: false, refreshExpiresAt: null });
  }
  const conn = await prisma.kakaoConnection.findUnique({
    where: { userId: user.id },
    select: { refreshTokenExpiresAt: true },
  });
  return NextResponse.json({
    configured: true,
    connected: !!conn,
    refreshExpiresAt: conn?.refreshTokenExpiresAt ?? null,
  });
}
