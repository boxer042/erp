import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { generateAccessToken } from "@/lib/serial-token";

// POST /api/rental-assets/[id]/qr — 임대 자산 QR 토큰 발급/재발급.
// 토큰이 없으면 생성, 있으면 그대로 반환. ?regenerate=1 이면 분실 대응 새 토큰.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, deny] = await guardUser();
  if (deny) return deny;
  const { id } = await params;

  const regenerate = new URL(request.url).searchParams.get("regenerate") === "1";

  const asset = await prisma.rentalAsset.findUnique({
    where: { id },
    select: { id: true, accessToken: true, accessTokenRevokedAt: true },
  });
  if (!asset) {
    return NextResponse.json(
      { error: "임대 자산을 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  let token = asset.accessToken;
  const needNew = !token || asset.accessTokenRevokedAt || regenerate;

  if (needNew) {
    token = generateAccessToken();
    await prisma.rentalAsset.update({
      where: { id },
      data: { accessToken: token, accessTokenRevokedAt: null },
    });
    await recordAudit(prisma, {
      userId: user.id,
      entity: "RentalAsset",
      entityId: id,
      action: "UPDATE",
      meta: { qrToken: regenerate ? "regenerated" : "issued" },
    });
  }

  return NextResponse.json({ accessToken: token });
}
