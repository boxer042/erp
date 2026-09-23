import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/** 기기 템플릿 목록 — 자주 쓰인 순. 카탈로그 매핑 상태 포함 (D11) */
export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const rows = await prisma.repairDeviceTemplate.findMany({
    orderBy: [{ usageCount: "desc" }, { text: "asc" }],
    select: {
      id: true,
      text: true,
      normalizedText: true,
      usageCount: true,
      productId: true,
      product: { select: { id: true, name: true, sku: true } },
    },
    take: 300,
  });
  return NextResponse.json(rows);
}
