import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardUser } from "@/lib/api-auth";
import { z } from "zod";

/**
 * 증상·원인 템플릿 병합 — "기화기 문제로 수리" ≈ "기화기 수리" 같은 파편화 정리.
 *
 * 자유 입력이 쌓이면 같은 뜻이 여러 행으로 갈라져 추천 정확도가 떨어진다.
 * 대표(target)를 정하고 나머지(sources)를 흡수 — 티켓·링크·학습 카운트를 모두
 * 대표로 재배치한 뒤 source 를 삭제한다.
 *
 * 복합 PK(@@id) 연결은 양쪽에 같은 조합이 있으면 UPDATE 가 충돌하므로,
 * 겹치면 카운트를 합산(merge)하고 아니면 이동(move)한다.
 */
const schema = z.object({
  kind: z.enum(["symptom", "diagnosis"]),
  targetId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
});

export async function POST(request: NextRequest) {
  const [, deny] = await guardUser();
  if (deny) return deny;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { kind, targetId, sourceIds } = parsed.data;

  const sources = sourceIds.filter((id) => id !== targetId);
  if (sources.length === 0) {
    return NextResponse.json({ error: "대표와 다른 항목을 선택해주세요" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        if (kind === "symptom") {
          const target = await tx.repairSymptomTemplate.findUnique({ where: { id: targetId } });
          if (!target) throw new Error("대표 증상을 찾을 수 없습니다");

          // 티켓 재배치
          const tickets = await tx.repairTicket.updateMany({
            where: { symptomTemplateId: { in: sources } },
            data: { symptomTemplateId: targetId },
          });

          // 증상↔원인 링크 — (symptomId, diagnosisId) 복합 PK
          const links = await tx.symptomDiagnosisLink.findMany({
            where: { symptomId: { in: sources } },
          });
          for (const l of links) {
            const exist = await tx.symptomDiagnosisLink.findUnique({
              where: { symptomId_diagnosisId: { symptomId: targetId, diagnosisId: l.diagnosisId } },
            });
            if (exist) {
              await tx.symptomDiagnosisLink.update({
                where: { symptomId_diagnosisId: { symptomId: targetId, diagnosisId: l.diagnosisId } },
                data: { occurrenceCount: { increment: l.occurrenceCount } },
              });
            } else {
              await tx.symptomDiagnosisLink.create({
                data: {
                  symptomId: targetId,
                  diagnosisId: l.diagnosisId,
                  occurrenceCount: l.occurrenceCount,
                  lastOccurredAt: l.lastOccurredAt,
                },
              });
            }
          }

          const absorbed = await tx.repairSymptomTemplate.findMany({
            where: { id: { in: sources } },
            select: { usageCount: true },
          });
          const addCount = absorbed.reduce((s, x) => s + x.usageCount, 0);

          // source 삭제 (링크는 Cascade)
          await tx.repairSymptomTemplate.deleteMany({ where: { id: { in: sources } } });
          await tx.repairSymptomTemplate.update({
            where: { id: targetId },
            data: { usageCount: { increment: addCount } },
          });

          return { merged: sources.length, tickets: tickets.count, links: links.length };
        }

        // ── 원인(diagnosis)
        const target = await tx.repairDiagnosisTemplate.findUnique({ where: { id: targetId } });
        if (!target) throw new Error("대표 원인을 찾을 수 없습니다");

        const tickets = await tx.repairTicket.updateMany({
          where: { diagnosisTemplateId: { in: sources } },
          data: { diagnosisTemplateId: targetId },
        });

        // 증상↔원인 링크
        const links = await tx.symptomDiagnosisLink.findMany({
          where: { diagnosisId: { in: sources } },
        });
        for (const l of links) {
          const exist = await tx.symptomDiagnosisLink.findUnique({
            where: { symptomId_diagnosisId: { symptomId: l.symptomId, diagnosisId: targetId } },
          });
          if (exist) {
            await tx.symptomDiagnosisLink.update({
              where: { symptomId_diagnosisId: { symptomId: l.symptomId, diagnosisId: targetId } },
              data: { occurrenceCount: { increment: l.occurrenceCount } },
            });
          } else {
            await tx.symptomDiagnosisLink.create({
              data: {
                symptomId: l.symptomId,
                diagnosisId: targetId,
                occurrenceCount: l.occurrenceCount,
                lastOccurredAt: l.lastOccurredAt,
              },
            });
          }
        }

        // 부속 학습 — (diagnosisId, productId)
        const partUsages = await tx.diagnosisPartUsage.findMany({ where: { diagnosisId: { in: sources } } });
        for (const u of partUsages) {
          const exist = await tx.diagnosisPartUsage.findUnique({
            where: { diagnosisId_productId: { diagnosisId: targetId, productId: u.productId } },
          });
          if (exist) {
            await tx.diagnosisPartUsage.update({
              where: { diagnosisId_productId: { diagnosisId: targetId, productId: u.productId } },
              data: { occurrenceCount: { increment: u.occurrenceCount } },
            });
          } else {
            await tx.diagnosisPartUsage.create({
              data: {
                diagnosisId: targetId,
                productId: u.productId,
                occurrenceCount: u.occurrenceCount,
                lastOccurredAt: u.lastOccurredAt,
              },
            });
          }
        }

        // 공임 학습 — (diagnosisId, laborName)
        const laborUsages = await tx.diagnosisLaborUsage.findMany({ where: { diagnosisId: { in: sources } } });
        for (const u of laborUsages) {
          const exist = await tx.diagnosisLaborUsage.findUnique({
            where: { diagnosisId_laborName: { diagnosisId: targetId, laborName: u.laborName } },
          });
          if (exist) {
            await tx.diagnosisLaborUsage.update({
              where: { diagnosisId_laborName: { diagnosisId: targetId, laborName: u.laborName } },
              data: {
                occurrenceCount: { increment: u.occurrenceCount },
                unitRate: u.unitRate, // 최근 입력 단가로 갱신
              },
            });
          } else {
            await tx.diagnosisLaborUsage.create({
              data: {
                diagnosisId: targetId,
                laborName: u.laborName,
                unitRate: u.unitRate,
                occurrenceCount: u.occurrenceCount,
                lastOccurredAt: u.lastOccurredAt,
              },
            });
          }
        }

        // 세트 학습 — (diagnosisId, productIds, laborNames) unique
        const sets = await tx.diagnosisPartSet.findMany({ where: { diagnosisId: { in: sources } } });
        for (const st of sets) {
          const exist = await tx.diagnosisPartSet.findFirst({
            where: {
              diagnosisId: targetId,
              productIds: { equals: st.productIds },
              laborNames: { equals: st.laborNames },
            },
          });
          if (exist) {
            await tx.diagnosisPartSet.update({
              where: { id: exist.id },
              data: { occurrenceCount: { increment: st.occurrenceCount } },
            });
          } else {
            await tx.diagnosisPartSet.create({
              data: {
                diagnosisId: targetId,
                productIds: st.productIds,
                laborNames: st.laborNames,
                avgQuantities: st.avgQuantities,
                avgLaborRates: st.avgLaborRates,
                occurrenceCount: st.occurrenceCount,
                lastOccurredAt: st.lastOccurredAt,
              },
            });
          }
        }

        const absorbed = await tx.repairDiagnosisTemplate.findMany({
          where: { id: { in: sources } },
          select: { usageCount: true },
        });
        const addCount = absorbed.reduce((s, x) => s + x.usageCount, 0);

        await tx.repairDiagnosisTemplate.deleteMany({ where: { id: { in: sources } } });
        await tx.repairDiagnosisTemplate.update({
          where: { id: targetId },
          data: { usageCount: { increment: addCount } },
        });

        return {
          merged: sources.length,
          tickets: tickets.count,
          links: links.length,
          partUsages: partUsages.length,
          laborUsages: laborUsages.length,
          sets: sets.length,
        };
      },
      { timeout: 30000, maxWait: 10000 },
    );

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "병합에 실패했습니다" },
      { status: 400 },
    );
  }
}
