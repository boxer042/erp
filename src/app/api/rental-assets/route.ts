import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function genAssetNo() {
  const r = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RA-${r}`;
}

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");
  const assets = await prisma.rentalAsset.findMany({
    where: {
      isActive: true,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(assets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, brand, modelNo, serialNo, productId, dailyRate, monthlyRate, depositAmount, memo } = body ?? {};
  if (!name?.trim()) return NextResponse.json({ error: "name 필수" }, { status: 400 });
  const asset = await prisma.rentalAsset.create({
    data: {
      assetNo: genAssetNo(),
      name: name.trim(),
      brand: brand?.trim() || null,
      modelNo: modelNo?.trim() || null,
      serialNo: serialNo?.trim() || null,
      productId: productId || null,
      dailyRate: dailyRate ? Number(dailyRate) : 0,
      monthlyRate: monthlyRate ? Number(monthlyRate) : 0,
      depositAmount: depositAmount ? Number(depositAmount) : 0,
      memo: memo?.trim() || null,
    },
  });
  return NextResponse.json(asset, { status: 201 });
}
