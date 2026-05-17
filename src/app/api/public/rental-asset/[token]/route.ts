import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseManualBlocks } from "@/lib/manual-blocks";

// GET /api/public/rental-asset/[token] — 임대 자산 QR 공개 페이지 (비인증).
// 자산번호 기반 영구 QR — 사용법(매뉴얼)만 노출. 개인정보 없음.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const asset = await prisma.rentalAsset.findUnique({
    where: { accessToken: token },
    select: {
      assetNo: true,
      name: true,
      brand: true,
      modelNo: true,
      imageUrl: true,
      hasManual: true,
      manualBlocks: true,
      accessTokenRevokedAt: true,
      isActive: true,
    },
  });
  if (!asset || asset.accessTokenRevokedAt || !asset.isActive) {
    return NextResponse.json({ error: "유효하지 않은 접근입니다" }, { status: 404 });
  }

  return NextResponse.json({
    assetNo: asset.assetNo,
    name: asset.name,
    brand: asset.brand,
    modelNo: asset.modelNo,
    imageUrl: asset.imageUrl,
    manualBlocks: asset.hasManual ? parseManualBlocks(asset.manualBlocks) : [],
  });
}
