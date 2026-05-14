import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 진단 템플릿 — 자유 입력 정규화. 카테고리별 필터링 + 증상 기반 추천 정렬.
 *
 * GET — 목록
 *   ?categoryId=...  특정 카테고리 + 공통 null 포함
 *   ?symptomId=...   해당 증상에 자주 매칭된 진단이 최상단으로
 *
 * symptomId 가 있으면:
 *   1순위: 그 증상과 link 가 있는 진단 (occurrenceCount desc)
 *   2순위: 같은 카테고리 (또는 공통) 의 나머지 진단 (usageCount desc)
 *   응답에 isLinked / linkCount 메타 포함 → 클라이언트 분류 가능.
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");
  const symptomId = searchParams.get("symptomId");

  const baseWhere = categoryId
    ? { OR: [{ categoryId }, { categoryId: null }] }
    : {};

  // symptomId 가 없으면 단순 목록
  if (!symptomId) {
    const list = await prisma.repairDiagnosisTemplate.findMany({
      where: baseWhere,
      orderBy: [{ usageCount: "desc" }, { text: "asc" }],
      select: { id: true, text: true, categoryId: true, usageCount: true },
    });
    return NextResponse.json(
      list.map((d) => ({ ...d, isLinked: false, linkCount: 0 })),
    );
  }

  // symptomId 있을 때 — link 와 join, sortKey 부여
  const [links, allDiagnoses] = await Promise.all([
    prisma.symptomDiagnosisLink.findMany({
      where: { symptomId },
      orderBy: { occurrenceCount: "desc" },
      select: { diagnosisId: true, occurrenceCount: true },
    }),
    prisma.repairDiagnosisTemplate.findMany({
      where: baseWhere,
      select: { id: true, text: true, categoryId: true, usageCount: true },
    }),
  ]);

  const linkByDiagnosis = new Map(
    links.map((l) => [l.diagnosisId, l.occurrenceCount]),
  );

  const merged = allDiagnoses
    .map((d) => ({
      ...d,
      isLinked: linkByDiagnosis.has(d.id),
      linkCount: linkByDiagnosis.get(d.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.isLinked && !b.isLinked) return -1;
      if (!a.isLinked && b.isLinked) return 1;
      if (a.isLinked && b.isLinked) return b.linkCount - a.linkCount;
      return b.usageCount - a.usageCount;
    });

  return NextResponse.json(merged);
}

const createSchema = z.object({
  text: z.string().min(1, "진단 텍스트를 입력해주세요").max(200),
  categoryId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const [user, deny] = await guardUser();
  if (deny) return deny;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const text = parsed.data.text.trim();
  const categoryId = parsed.data.categoryId ?? null;

  // categoryId null 인 경우 findFirst 우회 (Prisma nullable composite unique 타입 한계)
  const existing = categoryId
    ? await prisma.repairDiagnosisTemplate.findUnique({
        where: { categoryId_text: { categoryId, text } },
      })
    : await prisma.repairDiagnosisTemplate.findFirst({
        where: { categoryId: null, text },
      });
  if (existing) {
    return NextResponse.json(existing);
  }

  const created = await prisma.repairDiagnosisTemplate.create({
    data: {
      text,
      categoryId,
      createdById: user.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
