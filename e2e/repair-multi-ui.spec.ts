import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** 증상 칩 복수 선택 UI — 두 개 눌러 둘 다 선택 상태가 되어야 한다 */
test.describe("복수 선택 UI", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("증상 칩 2개 선택 → 둘 다 저장", async ({ page }) => {
    const ts = String(Date.now()).slice(-6);
    const user = await prisma.user.findFirst({ select: { id: true } });
    const a = await prisma.repairSymptomTemplate.create({ data: { text: `zz증상A${ts}`, usageCount: 9 } });
    const b = await prisma.repairSymptomTemplate.create({ data: { text: `zz증상B${ts}`, usageCount: 8 } });
    const ticket = await prisma.repairTicket.create({
      data: { ticketNo: `RTMU-${ts}`, type: "ON_SITE", status: "REPAIRING", receivedAt: new Date(), createdById: user!.id },
    });

    try {
      await page.goto(`/pos/repairs/${ticket.id}`);
      await page.getByText("증상", { exact: true }).first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(2000);

      await page.getByRole("button", { name: a.text }).first().click();
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: b.text }).first().click();
      await page.waitForTimeout(2000);

      // 둘 다 조인 테이블에 저장
      await expect
        .poll(async () => {
          const links = await prisma.repairTicketSymptom.findMany({ where: { ticketId: ticket.id } });
          return links.length;
        }, { timeout: 15_000 })
        .toBe(2);

      const t = await prisma.repairTicket.findUnique({ where: { id: ticket.id } });
      expect(t!.symptom).toContain(a.text);
      expect(t!.symptom).toContain(b.text);

      // 다시 누르면 해제 → 1개
      await page.getByRole("button", { name: a.text }).first().click();
      await expect
        .poll(async () => prisma.repairTicketSymptom.count({ where: { ticketId: ticket.id } }), { timeout: 15_000 })
        .toBe(1);
    } finally {
      await page.close().catch(() => {});
      await prisma.repairTicket.delete({ where: { id: ticket.id } }).catch(() => {});
      await prisma.repairSymptomTemplate.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });
});
