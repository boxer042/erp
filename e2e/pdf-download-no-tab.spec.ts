import { test, expect } from "@playwright/test";

/**
 * PDF 다운로드 시 새 탭이 열리지 않아야 한다.
 * (이전: window.open(?auto=1) → 다운로드 후 빈 탭이 남음)
 */
test("PDF 다운로드 — 새 탭 없이 저장된다", async ({ page, context }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/quotations");
  await page.waitForTimeout(2500);
  await page.locator("table tbody tr").first().locator("button").first().click({ force: true });
  await page.waitForTimeout(6000);

  const before = context.pages().length;
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /PDF 다운로드/ }).click();

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  await page.waitForTimeout(1500);
  expect(context.pages().length, "새 탭이 열리면 안 됨").toBe(before);
});
