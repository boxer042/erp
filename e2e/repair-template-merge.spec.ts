import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 원인 템플릿 병합 — 파편화된 항목을 대표로 흡수.
 * 핵심: 겹치는 학습 카운트는 합산, 안 겹치면 이동. 티켓 연결도 재배치.
 */
test.describe("템플릿 병합", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("원인 병합 — 티켓/링크/부속·공임 학습이 합산·이동된다", async ({ page }) => {
    const ts = Date.now();
    const user = await prisma.user.findFirst({ select: { id: true } });
    const products = await prisma.product.findMany({ select: { id: true }, take: 2 });
    expect(products.length).toBe(2);

    // 대표 + 흡수될 원인
    const target = await prisma.repairDiagnosisTemplate.create({
      data: { text: `기화기 수리 ${ts}`, usageCount: 3 },
    });
    const source = await prisma.repairDiagnosisTemplate.create({
      data: { text: `기화기 문제로 수리 ${ts}`, usageCount: 5 },
    });
    const symptom = await prisma.repairSymptomTemplate.create({
      data: { text: `시동 안걸림 ${ts}`, usageCount: 1 },
    });

    // 학습 데이터 — products[0] 은 양쪽에(합산 대상), products[1] 은 source 에만(이동 대상)
    await prisma.diagnosisPartUsage.createMany({
      data: [
        { diagnosisId: target.id, productId: products[0].id, occurrenceCount: 2 },
        { diagnosisId: source.id, productId: products[0].id, occurrenceCount: 7 },
        { diagnosisId: source.id, productId: products[1].id, occurrenceCount: 4 },
      ],
    });
    await prisma.diagnosisLaborUsage.createMany({
      data: [
        { diagnosisId: target.id, laborName: "기술료", unitRate: 30000, occurrenceCount: 1 },
        { diagnosisId: source.id, laborName: "기술료", unitRate: 35000, occurrenceCount: 6 },
      ],
    });
    await prisma.symptomDiagnosisLink.create({
      data: { symptomId: symptom.id, diagnosisId: source.id, occurrenceCount: 9 },
    });

    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RTM-${String(ts).slice(-7)}`,
        type: "ON_SITE", status: "REPAIRING", receivedAt: new Date(),
        createdById: user!.id, diagnosisTemplateId: source.id,
      },
    });

    try {
      const res = await page.request.post("/api/repair-templates/merge", {
        data: { kind: "diagnosis", targetId: target.id, sourceIds: [source.id] },
      });
      expect(res.ok(), `병합 실패: ${await res.text()}`).toBeTruthy();

      // source 는 사라짐
      expect(await prisma.repairDiagnosisTemplate.findUnique({ where: { id: source.id } })).toBeNull();

      // usageCount 합산 3 + 5
      const t = await prisma.repairDiagnosisTemplate.findUnique({ where: { id: target.id } });
      expect(t!.usageCount).toBe(8);

      // 티켓 재배치
      const tk = await prisma.repairTicket.findUnique({ where: { id: ticket.id } });
      expect(tk!.diagnosisTemplateId).toBe(target.id);

      // 부속 학습 — 겹친 건 합산(2+7=9), 안 겹친 건 이동(4)
      const pu = await prisma.diagnosisPartUsage.findMany({ where: { diagnosisId: target.id } });
      expect(pu.length).toBe(2);
      expect(pu.find((x) => x.productId === products[0].id)!.occurrenceCount).toBe(9);
      expect(pu.find((x) => x.productId === products[1].id)!.occurrenceCount).toBe(4);

      // 공임 학습 — 합산 1+6
      const lu = await prisma.diagnosisLaborUsage.findMany({ where: { diagnosisId: target.id } });
      expect(lu.length).toBe(1);
      expect(lu[0].occurrenceCount).toBe(7);

      // 증상 링크가 대표로 이동
      const link = await prisma.symptomDiagnosisLink.findUnique({
        where: { symptomId_diagnosisId: { symptomId: symptom.id, diagnosisId: target.id } },
      });
      expect(link!.occurrenceCount).toBe(9);
    } finally {
      await prisma.repairTicket.deleteMany({ where: { id: ticket.id } });
      await prisma.repairDiagnosisTemplate.deleteMany({ where: { id: { in: [target.id, source.id] } } });
      await prisma.repairSymptomTemplate.deleteMany({ where: { id: symptom.id } });
    }
  });
});
