import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/** 수리내용 템플릿 목록 — 자주 쓰인 순 (증상·원인과 동형) */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const categoryId = new URL(request.url).searchParams.get("categoryId");
  const rows = await prisma.repairContentTemplate.findMany({
    where: categoryId ? { OR: [{ categoryId }, { categoryId: null }] } : {},
    orderBy: [{ usageCount: "desc" }, { text: "asc" }],
    select: { id: true, text: true, categoryId: true, usageCount: true },
  });
  return NextResponse.json(rows);
}
