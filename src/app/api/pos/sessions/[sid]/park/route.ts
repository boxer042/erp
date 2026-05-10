import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 장바구니 저장 — 활성 세션을 그리드에서 숨기되 "저장된 상담" 페이지에서 부활 가능.
 * - parkedAt = now(), deletedAt 은 그대로 null
 * - 이미 parked 상태면 멱등 (parkedAt 갱신만)
 * - 다음 클라이언트 sync 의 rejectedIds 에 포함되어 sessionStorage 에서 제거됨
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { sid: id } = await params;

  const existing = await prisma.posSession.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "세션을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  if (existing.deletedAt) {
    return NextResponse.json(
      { error: "이미 삭제된 세션입니다" },
      { status: 400 },
    );
  }
  await prisma.posSession.update({
    where: { id },
    data: { parkedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
