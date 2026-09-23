import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/**
 * D11 — 기기 자유입력 정규화.
 * "에코 420es" / "에코 420-es" / "에코420ES" 는 같은 기기로 흡수돼야 한다.
 */
test.describe("기기 템플릿 정규화", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("표기만 다른 기기 입력이 하나로 모인다", async ({ page }) => {
    const ts = String(Date.now()).slice(-6);
    const user = await prisma.user.findFirst({ select: { id: true } });
    const variants = [`에코 ${ts}es`, `에코 ${ts}-ES`, `에코${ts}Es`];
    const tickets = [];

    try {
      for (const v of variants) {
        const t = await prisma.repairTicket.create({
          data: {
            ticketNo: `RTD-${ts}-${tickets.length}`,
            type: "ON_SITE", status: "RECEIVED",
            receivedAt: new Date(), createdById: user!.id,
          },
        });
        tickets.push(t);
        const res = await page.request.put(`/api/repair-tickets/${t.id}`, {
          data: { repairProductText: v },
        });
        expect(res.ok(), `저장 실패: ${await res.text()}`).toBeTruthy();
      }

      // 3번 입력했지만 템플릿은 1개, usageCount 3
      const tpls = await prisma.repairDeviceTemplate.findMany({
        where: { normalizedText: { contains: ts } },
      });
      expect(tpls.length, "표기 3종이 1개로 흡수돼야 함").toBe(1);
      expect(tpls[0].usageCount).toBe(3);
      // 표시용 원문은 최초 입력 보존
      expect(tpls[0].text).toBe(variants[0]);

      // 티켓 3건 모두 같은 템플릿에 연결
      const linked = await prisma.repairTicket.findMany({
        where: { id: { in: tickets.map((t) => t.id) } },
        select: { repairDeviceTemplateId: true },
      });
      expect(new Set(linked.map((l) => l.repairDeviceTemplateId)).size).toBe(1);
      expect(linked[0].repairDeviceTemplateId).toBe(tpls[0].id);
    } finally {
      await page.close().catch(() => {});
      for (const t of tickets) {
        await prisma.repairTicket.delete({ where: { id: t.id } }).catch(() => {});
      }
      await prisma.repairDeviceTemplate.deleteMany({ where: { normalizedText: { contains: ts } } });
    }
  });
});
