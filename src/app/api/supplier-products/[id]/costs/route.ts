import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardAdmin } from "@/lib/api-auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const costs = await prisma.incomingCost.findMany({
    where: { supplierProductId: id, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(costs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { id } = await params;
  const body = await request.json();
  const { name, costType, value, perUnit, isTaxable } = body as {
    name: string;
    costType: "PERCENTAGE" | "FIXED";
    value: string;
    perUnit: boolean;
    isTaxable: boolean;
  };

  if (!name || !value) {
    return NextResponse.json({ error: "이름과 값을 입력해주세요" }, { status: 400 });
  }

  // 배송비/택배비 등은 입고비용에서 분리됨 — 입고 전표 또는 품목별 배송비 필드를 사용
  const blockedKeywords = ["배송비", "택배비", "운임", "shipping", "delivery", "freight"];
  const lower = name.toLowerCase();
  if (blockedKeywords.some((k) => name.includes(k) || lower.includes(k))) {
    return NextResponse.json(
      { error: "배송비/택배비/운임 항목은 입고비용에 등록할 수 없습니다. 입고 전표의 배송비 또는 품목별 배송비를 사용해주세요." },
      { status: 400 }
    );
  }

  const cost = await prisma.incomingCost.create({
    data: {
      supplierProductId: id,
      name,
      costType,
      value: parseFloat(value),
      perUnit,
      isTaxable: isTaxable ?? true,
    },
  });

  return NextResponse.json(cost, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [, deny] = await guardAdmin();
  if (deny) return deny;
  const { searchParams } = new URL(request.url);
  const costId = searchParams.get("costId");

  if (!costId) {
    return NextResponse.json({ error: "costId가 필요합니다" }, { status: 400 });
  }

  await prisma.incomingCost.update({
    where: { id: costId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true });
}
