import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** D11 — 기기 탭에서 카탈로그 상품 매핑 */
test.describe("기기 카탈로그 매핑", () => {
  test.afterAll(async () => { await prisma.$disconnect(); });

  test("기기 탭 → 상품 연결 → 연결됨 표시", async ({ page }) => {
    const ts = String(Date.now()).slice(-6);
    const product = await prisma.product.findFirst({ select: { id: true, name: true } });
    const dev = await prisma.repairDeviceTemplate.create({
      data: { text: `테스트기기 ${ts}`, normalizedText: `테스트기기${ts}`, usageCount: 3 },
    });

    try {
      await page.goto("/repairs/templates");
      await page.getByRole("heading", { name: "수리 템플릿 관리" }).waitFor({ timeout: 60_000 });
      await page.getByRole("tab", { name: "기기" }).click();
      await page.waitForTimeout(1500);

      // 목록에 노출 + 미연결
      await expect(page.getByText(`테스트기기 ${ts}`)).toBeVisible({ timeout: 20_000 });

      // 상품 연결
      const row = page.getByRole("row").filter({ hasText: `테스트기기 ${ts}` });
      await row.getByRole("button", { name: "상품 연결" }).click();
      await expect(page.getByRole("heading", { name: "카탈로그 상품 연결" })).toBeVisible();
      await page.getByRole("button", { name: /카탈로그에서 상품 선택|상품 불러오는 중/ }).click();
      await page.waitForTimeout(800);
      await page.getByRole("option").first().click().catch(async () => {
        await page.getByText(product!.name, { exact: true }).first().click();
      });
      await page.getByRole("button", { name: "연결", exact: true }).click();

      // DB 반영
      await expect
        .poll(async () => {
          const d = await prisma.repairDeviceTemplate.findUnique({ where: { id: dev.id } });
          return d?.productId;
        }, { timeout: 15_000 })
        .toBeTruthy();
    } finally {
      await page.close().catch(() => {});
      await prisma.repairDeviceTemplate.delete({ where: { id: dev.id } }).catch(() => {});
    }
  });
});
