import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { getCurrentPolicy, nextVersionId } from "@/lib/privacy-policy";

// GET /api/privacy-policy — 현재 약관 + 버전 이력 (매장 편집용).
export async function GET() {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const current = await getCurrentPolicy();
  const versions = await prisma.privacyPolicyVersion.findMany({
    orderBy: { publishedAt: "desc" },
    select: { id: true, publishedAt: true, isCurrent: true },
  });
  return NextResponse.json({ ...current, versions });
}

const putSchema = z.object({
  content: z.string().min(1),
  // true 면 새 버전으로 게시 — 약관 중대 변경 시. false(기본)는 현재 버전 본문만 수정.
  publishNewVersion: z.boolean().optional(),
});

// PUT /api/privacy-policy — 약관 수정 또는 새 버전 게시.
export async function PUT(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "약관 내용을 입력해주세요" }, { status: 400 });
  }

  const current = await getCurrentPolicy();

  if (parsed.data.publishNewVersion) {
    const newId = nextVersionId(current.id);
    const created = await prisma.$transaction(async (tx) => {
      await tx.privacyPolicyVersion.update({
        where: { id: current.id },
        data: { isCurrent: false },
      });
      return tx.privacyPolicyVersion.create({
        data: { id: newId, content: parsed.data.content, isCurrent: true },
      });
    });
    return NextResponse.json(created);
  }

  const updated = await prisma.privacyPolicyVersion.update({
    where: { id: current.id },
    data: { content: parsed.data.content },
  });
  return NextResponse.json(updated);
}
