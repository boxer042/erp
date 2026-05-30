import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 케이스 B — 중고 조립 (UsedItemBuild) 검증.
 *
 * 흐름: 중고 2개 + 신품 부품 1개 → 조립 → 결과 UsedItem(BUILT)
 *  - 재료 중고 → status=ASSEMBLED_INTO
 *  - 신품 부품 → lot FIFO 차감
 *  - 결과 누적원가 = 중고합 + 부품 + 공임
 *  - lineage(UsedItemBuildSource/Part) 기록
 *  - 카탈로그 Product 미생성 (더미 0)
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

test.describe("케이스 B — 중고 조립", () => {
  // 새 라우트 cold-compile 여유 (dev server on-demand 컴파일)
  test.setTimeout(120_000);

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("중고2 + 신품1 조립 → 결과 UsedItem(BUILT) + 재료 소진 + 원가 합산", async ({
    page,
  }) => {
    const ts = Date.now();

    // ── fixture: 중고 2개 (각 30000, 50000) ──
    const used1 = await prisma.usedItem.create({
      data: {
        internalCode: `UU260530-B1${String(ts).slice(-3)}`,
        displayName: `조립재료A${ts}`,
        acquiredFrom: "PURCHASED",
        acquiredCost: "30000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "IN_STOCK",
      },
    });
    const used2 = await prisma.usedItem.create({
      data: {
        internalCode: `UU260530-B2${String(ts).slice(-3)}`,
        displayName: `조립재료B${ts}`,
        acquiredFrom: "SCAVENGED",
        acquiredCost: "50000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "IN_STOCK",
      },
    });

    // ── fixture: 신품 부품 1개 + lot (단가 10000, 재고 5) ──
    const part = await prisma.product.create({
      data: {
        name: `조립신품부품${ts}`,
        sku: `BUILD-PART-${ts}`,
        unitOfMeasure: "EA",
        productType: "PARTS",
        isActive: true,
      },
    });
    await prisma.inventory.create({
      data: { productId: part.id, quantity: 5 },
    });
    await prisma.inventoryLot.create({
      data: {
        productId: part.id,
        receivedQty: 5,
        remainingQty: 5,
        unitCost: 10000,
        receivedAt: new Date(),
        source: "INCOMING",
      },
    });

    // ── 빌드 API 호출 (인증된 page) ──
    const res = await page.request.post("/api/used-items/build", {
      timeout: 90_000,
      data: {
        displayName: `리퍼비시완성품${ts}`,
        productId: null,
        builtAt: new Date().toISOString().slice(0, 10),
        laborCost: "20000",
        issueSerial: false,
        sourceUsedItemIds: [used1.id, used2.id],
        parts: [{ componentId: part.id, quantity: "2" }],
      },
    });
    expect(res.ok()).toBe(true);
    const built = (await res.json()) as { id: string; internalCode: string };

    // ── 검증 ──
    const result = await prisma.usedItem.findUnique({
      where: { id: built.id },
      include: {
        buildAsResult: {
          include: { usedItemSources: true, partConsumptions: true },
        },
      },
    });
    // source=BUILT
    expect(result?.acquiredFrom).toBe("BUILT");
    // 누적원가 = 30000 + 50000 + (10000×2) + 20000(공임) = 120000
    expect(Number(result?.acquiredCost)).toBe(120000);
    // lineage: 중고 2 + 부품 1
    expect(result?.buildAsResult?.usedItemSources.length).toBe(2);
    expect(result?.buildAsResult?.partConsumptions.length).toBe(1);

    // 재료 중고 → ASSEMBLED_INTO
    const s1 = await prisma.usedItem.findUnique({ where: { id: used1.id } });
    const s2 = await prisma.usedItem.findUnique({ where: { id: used2.id } });
    expect(s1?.status).toBe("ASSEMBLED_INTO");
    expect(s2?.status).toBe("ASSEMBLED_INTO");

    // 신품 부품 재고 5 → 3 차감
    const inv = await prisma.inventory.findUnique({ where: { productId: part.id } });
    expect(Number(inv?.quantity)).toBe(3);

    // ── cleanup (lineage cascade → build, source, part 자동 삭제) ──
    await prisma.usedItem.delete({ where: { id: built.id } }); // result + build cascade
    await prisma.usedItem.deleteMany({ where: { id: { in: [used1.id, used2.id] } } });
    const invRow = await prisma.inventory.findUnique({ where: { productId: part.id } });
    if (invRow) {
      await prisma.inventoryMovement.deleteMany({ where: { inventoryId: invRow.id } });
    }
    await prisma.inventoryLot.deleteMany({ where: { productId: part.id } });
    await prisma.inventory.deleteMany({ where: { productId: part.id } });
    await prisma.product.delete({ where: { id: part.id } });
  });

  test("IN_STOCK 아닌 중고는 재료로 못 씀 (차단)", async ({ page }) => {
    const ts = Date.now();
    const soldUsed = await prisma.usedItem.create({
      data: {
        internalCode: `UU260530-B3${String(ts).slice(-3)}`,
        displayName: `이미판매${ts}`,
        acquiredFrom: "PURCHASED",
        acquiredCost: "10000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "SOLD",
      },
    });

    const res = await page.request.post("/api/used-items/build", {
      timeout: 90_000,
      data: {
        displayName: `차단테스트${ts}`,
        builtAt: new Date().toISOString().slice(0, 10),
        laborCost: "0",
        sourceUsedItemIds: [soldUsed.id],
        parts: [],
      },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/보관 중 상태가 아닙니다/);

    await prisma.usedItem.delete({ where: { id: soldUsed.id } });
  });

  test("빌드 화면 로드 + 목록 [조립품 만들기] 진입", async ({ page }) => {
    await page.goto("/inventory/used-items");
    await expect(
      page.getByRole("heading", { name: "중고 단품" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "조립품 만들기" }).click();
    await page.waitForURL(/\/inventory\/used-items\/build/);
    await expect(page.getByText("중고 조립품 만들기")).toBeVisible();
    await expect(page.getByText("재료 ① 중고 단품 (필수)")).toBeVisible();
  });
});
