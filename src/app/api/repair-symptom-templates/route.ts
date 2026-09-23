import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";

/**
 * 증상 템플릿 — 자유 입력 정규화. 카테고리별로 필터링·정렬.
 *
 * GET — 목록
 *   ?categoryId=...  (특정 카테고리 + 공통 null 포함)
 *   ?symptomId=...   사용 안 함 (진단 쪽에서만 의미)
 * usageCount desc 정렬 — 자주 쓰는 것이 위로.
 *
 * POST — 신규 생성. 이미 (categoryId, text) 있으면 그 row 반환.
 */
export async function GET(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  // 특정 카테고리 + 공통(null) 함께 — 어떤 카테고리든 공통 증상은 노출
  const templates = await prisma.repairSymptomTemplate.findMany({
    where: categoryId
      ? { OR: [{ categoryId }, { categoryId: null }] }
      : {},
    orderBy: [{ usageCount: "desc" }, { text: "asc" }],
    select: { id: true, text: true, categoryId: true, usageCount: true },
  });

  // 각 증상에 자주 붙는 원인 — 템플릿 관리에서 연결 관계를 보여주기 위함
  const links = templates.length
    ? await prisma.symptomDiagnosisLink.findMany({
        where: { symptomId: { in: templates.map((t) => t.id) } },
        orderBy: { occurrenceCount: "desc" },
        select: {
          symptomId: true,
          occurrenceCount: true,
          diagnosis: { select: { id: true, text: true } },
        },
      })
    : [];

  const bySymptom = new Map<string, { id: string; text: string; count: number }[]>();
  for (const l of links) {
    const arr = bySymptom.get(l.symptomId) ?? [];
    if (arr.length < 3) {
      arr.push({ id: l.diagnosis.id, text: l.diagnosis.text, count: l.occurrenceCount });
      bySymptom.set(l.symptomId, arr);
    }
  }

  return NextResponse.json(
    templates.map((t) => ({ ...t, linkedDiagnoses: bySymptom.get(t.id) ?? [] })),
  );
}

const createSchema = z.object({
  text: z.string().min(1, "증상 텍스트를 입력해주세요").max(200),
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

  // 중복 방지 — (categoryId, text) unique. categoryId 가 null 이면 findFirst 로 우회 (Prisma 의 nullable composite unique 타입 한계).
  const existing = categoryId
    ? await prisma.repairSymptomTemplate.findUnique({
        where: { categoryId_text: { categoryId, text } },
      })
    : await prisma.repairSymptomTemplate.findFirst({
        where: { categoryId: null, text },
      });
  if (existing) {
    return NextResponse.json(existing);
  }

  const created = await prisma.repairSymptomTemplate.create({
    data: {
      text,
      categoryId,
      createdById: user.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
