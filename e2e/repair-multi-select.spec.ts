import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * 증상·원인·수리내용 복수 선택 (B안).
 * 조인 테이블이 진짜 데이터, 텍스트 필드는 표시용 파생값.
 */
test.describe("복수 선택", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("복수 저장 → 조인 테이블 + 파생 텍스트 + 대표 FK", async ({ page }) => {
    const ts = String(Date.now()).slice(-6);
    const user = await prisma.user.findFirst({ select: { id: true } });
    const ticket = await prisma.repairTicket.create({
      data: {
        ticketNo: `RTM2-${ts}`, type: "ON_SITE", status: "REPAIRING",
        receivedAt: new Date(), createdById: user!.id,
      },
    });

    try {
      const res = await page.request.put(`/api/repair-tickets/${ticket.id}`, {
        data: {
          symptoms: [`시동불량${ts}`, `누수${ts}`],
          diagnoses: [`기화기막힘${ts}`, `패킹마모${ts}`],
          repairContents: [`기화기세척${ts}`, `패킹교체${ts}`],
        },
      });
      expect(res.ok(), `저장 실패: ${await res.text()}`).toBeTruthy();

      const t = await prisma.repairTicket.findUnique({
        where: { id: ticket.id },
        include: {
          symptomLinks: { orderBy: { position: "asc" }, include: { symptom: true } },
          diagnosisLinks: { orderBy: { position: "asc" }, include: { diagnosis: true } },
          contentLinks: { orderBy: { position: "asc" }, include: { content: true } },
        },
      });

      // 조인 테이블 — 각 2건, 순서 보존
      expect(t!.symptomLinks.length).toBe(2);
      expect(t!.diagnosisLinks.length).toBe(2);
      expect(t!.contentLinks.length).toBe(2);
      expect(t!.symptomLinks[0].symptom.text).toBe(`시동불량${ts}`);

      // 파생 텍스트 — 기존 화면(영수증·승인)이 읽는 필드
      expect(t!.symptom).toBe(`시동불량${ts} · 누수${ts}`);
      expect(t!.diagnosis).toBe(`기화기막힘${ts} · 패킹마모${ts}`);
      expect(t!.repairContent).toBe(`기화기세척${ts} · 패킹교체${ts}`);

      // 대표 FK — 추천 로직 호환
      expect(t!.symptomTemplateId).toBe(t!.symptomLinks[0].symptomId);
      expect(t!.diagnosisTemplateId).toBe(t!.diagnosisLinks[0].diagnosisId);

      // replace 동작 — 하나로 줄이면 조인도 1건
      const res2 = await page.request.put(`/api/repair-tickets/${ticket.id}`, {
        data: { symptoms: [`누수${ts}`] },
      });
      expect(res2.ok()).toBeTruthy();
      const t2 = await prisma.repairTicket.findUnique({
        where: { id: ticket.id },
        include: { symptomLinks: true },
      });
      expect(t2!.symptomLinks.length).toBe(1);
      expect(t2!.symptom).toBe(`누수${ts}`);
    } finally {
      await page.close().catch(() => {});
      await prisma.repairTicket.delete({ where: { id: ticket.id } }).catch(() => {});
      await prisma.repairSymptomTemplate.deleteMany({ where: { text: { contains: ts } } });
      await prisma.repairDiagnosisTemplate.deleteMany({ where: { text: { contains: ts } } });
      await prisma.repairContentTemplate.deleteMany({ where: { text: { contains: ts } } });
    }
  });
});
