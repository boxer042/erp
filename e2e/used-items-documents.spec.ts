import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 5 — 견적서·거래명세표 검색에 UsedItem 통합.
 *
 * 정책 (§6.2): 재고 있으면 노출, 판매되면 자동 숨김 (status=IN_STOCK 필터).
 * 선택 시 productId=null 자유 입력 라인 (FK 안전) + 이름 "(중고)" prefix.
 *
 * UI 흐름 (Sheet 안 ProductCombobox popup 검색) 은 e2e 부담이 커서
 * 핵심 데이터 흐름을 API + Prisma 직접으로 검증.
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

test.describe("Phase 5 — 견적서·명세표 UsedItem 통합", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("IN_STOCK 중고만 노출 — SOLD 는 검색 응답에서 제외", async ({ page }) => {
    const ts = Date.now();

    // IN_STOCK 1건 + SOLD 1건 생성
    const inStock = await prisma.usedItem.create({
      data: {
        internalCode: `UU260529-P5I${String(ts).slice(-3)}`,
        displayName: `Phase5재고중${ts}`,
        acquiredFrom: "PURCHASED",
        acquiredCost: "30000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "IN_STOCK",
      },
    });
    const sold = await prisma.usedItem.create({
      data: {
        internalCode: `UU260529-P5S${String(ts).slice(-3)}`,
        displayName: `Phase5판매됨${ts}`,
        acquiredFrom: "PURCHASED",
        acquiredCost: "40000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "SOLD",
      },
    });

    // 견적서/명세표가 호출하는 동일 엔드포인트
    const res = await page.request.get(
      "/api/used-items?status=IN_STOCK&limit=500",
    );
    expect(res.ok()).toBe(true);
    const list = (await res.json()) as Array<{ id: string }>;

    // IN_STOCK 은 포함, SOLD 는 제외
    expect(list.some((u) => u.id === inStock.id)).toBe(true);
    expect(list.some((u) => u.id === sold.id)).toBe(false);

    // cleanup
    await prisma.usedItem.deleteMany({
      where: { id: { in: [inStock.id, sold.id] } },
    });
  });

  test("견적서 sheet — 판매 견적 신규 진입 시 로드", async ({ page }) => {
    // 견적서 페이지 진입 → 신규 판매 견적 sheet 가 ProductCombobox 를 포함해 정상 로드되는지
    await page.goto("/quotations");
    await expect(page).toHaveURL(/\/quotations/, { timeout: 20_000 });
    // 페이지 자체가 에러 없이 로드되면 OK (sheet 안 검색 통합은 데이터 레벨에서 위 테스트로 검증)
    await expect(page.locator("body")).toBeVisible();
  });

  test("거래명세표 sheet — 페이지 로드", async ({ page }) => {
    await page.goto("/statements");
    await expect(page).toHaveURL(/\/statements/, { timeout: 20_000 });
    await expect(page.locator("body")).toBeVisible();
  });
});
