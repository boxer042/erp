import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

// 판매 기술료/공임 프리셋 — POS 카트·ERP 주문 생성에서 빠르게 선택.
export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams.get("search") ?? "";
  const presets = await prisma.serviceFeePreset.findMany({
    where: {
      isActive: true,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(presets);
}

export async function POST(request: NextRequest) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const body = await request.json();
  const { name, unitPrice, memo } = body ?? {};
  if (!name?.trim() || unitPrice === undefined) {
    return NextResponse.json(
      { error: "이름과 금액은 필수입니다" },
      { status: 400 },
    );
  }
  const preset = await prisma.serviceFeePreset.create({
    data: {
      name: name.trim(),
      unitPrice: parseFloat(String(unitPrice)) || 0,
      memo: memo?.trim() || null,
    },
  });
  return NextResponse.json(preset, { status: 201 });
}
