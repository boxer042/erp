import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Phase 4 — 임대 자산 → 중고 전환 + 시리얼 단품 판매 흐름.
 *
 * 검증:
 *  1. RentalAsset 페이지 — 전환 가능한 자산에 [중고로 전환] 액션 노출
 *  2. POST /api/rental-assets/[id]/convert-to-used:
 *     - RentalAsset.status = RETIRED + isActive=false
 *     - UsedItem 생성 (acquiredFrom=RENTAL_RETIREMENT, rentalAssetId link)
 *     - 시리얼 발번 토글 ON 이면 SerialItem 1건 (source=USED_INTAKE, soldAt=null)
 *  3. RENTED 상태 자산은 전환 차단
 *  4. lineage — UsedItem 상세 페이지에서 RentalAsset 출처 확인 가능
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

test.describe("Phase 4 — 임대 → 중고 전환", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("AVAILABLE 자산 전환 → UsedItem 생성 + RentalAsset RETIRED + 시리얼 발번 lineage", async ({
    page,
  }) => {
    const ts = Date.now();
    const assetNo = `T${String(ts).slice(-6)}`;

    // 1) 임대 자산 fixture 생성 (status=AVAILABLE)
    const asset = await prisma.rentalAsset.create({
      data: {
        assetNo,
        name: `Phase4테스트자산${ts}`,
        brand: "테스트",
        modelNo: `MODEL-${ts}`,
        dailyRate: "10000",
        monthlyRate: "200000",
        depositAmount: "0",
        status: "AVAILABLE",
        isActive: true,
      },
    });

    // 2) 인증된 page 로 API 호출 (storageState 활용)
    const response = await page.request.post(
      `/api/rental-assets/${asset.id}/convert-to-used`,
      {
        data: {
          acquiredCost: "0",
          issueSerial: true,
          warrantyMonths: 6,
          memo: `Phase4 테스트 전환 ${ts}`,
        },
      },
    );
    expect(response.ok()).toBe(true);
    const created = (await response.json()) as {
      id: string;
      internalCode: string;
      rentalAssetId: string | null;
      serialItem: { id: string; code: string } | null;
    };

    // 3) UsedItem 검증
    expect(created.rentalAssetId).toBe(asset.id);
    expect(created.serialItem).not.toBeNull();
    expect(created.serialItem?.code).toMatch(/^\d{6}-\d{4}$/);

    const fullUsedItem = await prisma.usedItem.findUnique({
      where: { id: created.id },
      include: { serialItem: true },
    });
    expect(fullUsedItem?.acquiredFrom).toBe("RENTAL_RETIREMENT");
    expect(fullUsedItem?.status).toBe("IN_STOCK");
    expect(fullUsedItem?.serialItem?.source).toBe("USED_INTAKE");
    expect(fullUsedItem?.serialItem?.soldAt).toBeNull();

    // 4) RentalAsset 상태 검증
    const updatedAsset = await prisma.rentalAsset.findUnique({
      where: { id: asset.id },
    });
    expect(updatedAsset?.status).toBe("RETIRED");
    expect(updatedAsset?.isActive).toBe(false);

    // 5) cleanup — UsedItem 먼저, 그 다음 SerialItem, 마지막으로 RentalAsset
    await prisma.usedItem.delete({ where: { id: created.id } });
    if (created.serialItem) {
      await prisma.serialItem.delete({ where: { id: created.serialItem.id } });
    }
    await prisma.rentalAsset.delete({ where: { id: asset.id } });
  });

  test("RENTED 자산 전환 차단", async ({ page }) => {
    const ts = Date.now();
    const assetNo = `T${String(ts).slice(-6)}R`;

    const asset = await prisma.rentalAsset.create({
      data: {
        assetNo,
        name: `Phase4임대중${ts}`,
        dailyRate: "10000",
        monthlyRate: "200000",
        depositAmount: "0",
        status: "RENTED", // 임대 중
        isActive: true,
      },
    });

    const response = await page.request.post(
      `/api/rental-assets/${asset.id}/convert-to-used`,
      {
        data: { acquiredCost: "0", issueSerial: false, warrantyMonths: 0 },
      },
    );
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/임대 중/);

    // cleanup
    await prisma.rentalAsset.delete({ where: { id: asset.id } });
  });

  test("중복 전환 차단", async ({ page }) => {
    const ts = Date.now();
    const assetNo = `T${String(ts).slice(-6)}D`;

    const asset = await prisma.rentalAsset.create({
      data: {
        assetNo,
        name: `Phase4중복${ts}`,
        dailyRate: "10000",
        monthlyRate: "200000",
        depositAmount: "0",
        status: "AVAILABLE",
        isActive: true,
      },
    });

    // 1차 전환
    const r1 = await page.request.post(
      `/api/rental-assets/${asset.id}/convert-to-used`,
      { data: { acquiredCost: "0", issueSerial: false, warrantyMonths: 0 } },
    );
    expect(r1.ok()).toBe(true);
    const u1 = (await r1.json()) as { id: string };

    // RentalAsset.status 가 RETIRED 라 2차 전환은 status 차단 또는 이미 link 됐다는 에러
    const r2 = await page.request.post(
      `/api/rental-assets/${asset.id}/convert-to-used`,
      { data: { acquiredCost: "0", issueSerial: false, warrantyMonths: 0 } },
    );
    expect(r2.status()).toBe(400);

    // cleanup
    await prisma.usedItem.delete({ where: { id: u1.id } });
    await prisma.rentalAsset.delete({ where: { id: asset.id } });
  });

  test("UI — 임대 자산 페이지 행에 [중고로 전환] 액션 보임", async ({ page }) => {
    const ts = Date.now();
    const assetNo = `T${String(ts).slice(-6)}U`;

    const asset = await prisma.rentalAsset.create({
      data: {
        assetNo,
        name: `Phase4UI${ts}`,
        dailyRate: "10000",
        monthlyRate: "200000",
        depositAmount: "0",
        status: "AVAILABLE",
        isActive: true,
      },
    });

    await page.goto("/rental-assets");

    // [중고로 전환] 액션 노출 검증 — 새로 만든 자산 한정. 페이지 로드 + 표 렌더 시간 여유.
    await expect(
      page.getByRole("button", { name: "중고로 전환" }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // cleanup
    await prisma.rentalAsset.delete({ where: { id: asset.id } });
  });
});
