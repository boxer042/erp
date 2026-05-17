import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 자산번호 생성 — `RA-YYMMDD-NNNN` (당일 시퀀스 4자리).
 * 같은 날 RA-YYMMDD- prefix 자산 개수 + 1 로 결정. 동시성 충돌은 unique constraint + retry 로 대응.
 */
async function genAssetNo(): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `RA-${yy}${mm}${dd}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const count = await prisma.rentalAsset.count({
      where: { createdAt: { gte: todayStart }, assetNo: { startsWith: prefix } },
    });
    const seq = String(count + 1 + attempt).padStart(4, "0");
    const candidate = `${prefix}${seq}`;
    const exists = await prisma.rentalAsset.findUnique({
      where: { assetNo: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // 매우 드문 경합 — fallback to random
  const r = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${r}`;
}

export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const status = request.nextUrl.searchParams.get("status");
  const assets = await prisma.rentalAsset.findMany({
    where: {
      isActive: true,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      product: { select: { imageUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  // 자산 자체 imageUrl 우선, 없으면 연결 Product.imageUrl 폴백.
  const shaped = assets.map(({ product, ...a }) => ({
    ...a,
    imageUrl: a.imageUrl ?? product?.imageUrl ?? null,
  }));
  return NextResponse.json(shaped);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;
  const body = await request.json();
  const {
    name,
    brand,
    modelNo,
    productId,
    imageUrl,
    dailyRate,
    monthlyRate,
    depositAmount,
    memo,
  } = body ?? {};
  if (!name?.trim()) return NextResponse.json({ error: "name 필수" }, { status: 400 });
  const assetNo = await genAssetNo();
  const asset = await prisma.rentalAsset.create({
    data: {
      assetNo,
      name: name.trim(),
      brand: brand?.trim() || null,
      modelNo: modelNo?.trim() || null,
      productId: productId || null,
      imageUrl: imageUrl?.trim() || null,
      dailyRate: dailyRate ? Number(dailyRate) : 0,
      monthlyRate: monthlyRate ? Number(monthlyRate) : 0,
      depositAmount: depositAmount ? Number(depositAmount) : 0,
      memo: memo?.trim() || null,
    },
  });
  return NextResponse.json(asset, { status: 201 });
}
