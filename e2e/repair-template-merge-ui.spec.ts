import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** 템플릿 관리 페이지에서 다중선택 → 대표지정 → 병합까지 (D4 진입점 + D5 UI) */
test.describe("템플릿 병합 UI", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("사이드바 진입 → 선택 → 병합", async ({ page }) => {
    const ts = String(Date.now()).slice(-6);
    const a = await prisma.repairSymptomTemplate.create({
      data: { text: `zz시동불량A${ts}`, usageCount: 5 },
    });
    const b = await prisma.repairSymptomTemplate.create({
      data: { text: `zz시동불량B${ts}`, usageCount: 2 },
    });

    try {
      // D4 — 사이드바 진입점
      await page.goto("/repairs");
      const link = page.getByRole("link", { name: "수리 템플릿" }).first();
      await expect(link).toBeVisible({ timeout: 30_000 });
      await link.click();
      await expect(page).toHaveURL(/\/repairs\/templates/, { timeout: 60_000 });
      await page.getByRole("heading", { name: "수리 템플릿 관리" }).waitFor({ timeout: 60_000 });

      // 검색으로 대상 좁히기
      await page.getByPlaceholder(/검색/).first().fill(`zz시동불량`);
      await page.waitForTimeout(500);

      // 두 항목 선택
      await page.getByRole("checkbox", { name: `${a.text} 선택` }).check();
      await page.getByRole("checkbox", { name: `${b.text} 선택` }).check();
      await expect(page.getByText("2개 선택됨")).toBeVisible();

      // 병합 → 대표는 사용횟수 많은 A 가 기본
      await page.getByRole("button", { name: "병합", exact: true }).click();
      await expect(page.getByRole("heading", { name: "증상 병합" })).toBeVisible();
      await page.getByRole("button", { name: /1개 흡수/ }).click();

      // B 는 사라지고 A 가 7회로
      await expect
        .poll(async () => prisma.repairSymptomTemplate.findUnique({ where: { id: b.id } }), {
          timeout: 15_000,
        })
        .toBeNull();
      const merged = await prisma.repairSymptomTemplate.findUnique({ where: { id: a.id } });
      expect(merged!.usageCount).toBe(7);
    } finally {
      await prisma.repairSymptomTemplate.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    }
  });
});
