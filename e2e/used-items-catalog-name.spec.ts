import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * 옵션 B 검증 — 카탈로그 매칭 중고는 표시 이름이 product.name(live) 을 따라감.
 *
 * 1. 카탈로그 Product 1개 + 그것에 매칭된 UsedItem 생성
 * 2. /api/used-items 응답에 product.name 이 포함되는지
 * 3. Product.name 변경 → API 응답의 product.name 도 바뀌는지 (= 표시 이름 전파)
 *    (displayName 스냅샷은 그대로지만, 표시 헬퍼 usedItemName 은 product.name 우선)
 */

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});
const prisma = new PrismaClient({ adapter });

test.describe("중고 — 카탈로그 이름 추종 (옵션 B)", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("카탈로그 rename 시 중고 표시 이름도 따라감", async ({ page }) => {
    const ts = Date.now();
    const originalName = `Phase옵션B원본${ts}`;
    const renamedName = `Phase옵션B변경${ts}`;

    // 1) 카탈로그 Product 생성
    const product = await prisma.product.create({
      data: {
        name: originalName,
        sku: `OPTB-${ts}`,
        unitOfMeasure: "EA",
        productType: "PARTS",
        isActive: true,
      },
    });

    // 2) 그 Product 에 매칭된 UsedItem — 등록 시점 displayName=원본 이름 (스냅샷)
    const usedItem = await prisma.usedItem.create({
      data: {
        internalCode: `UU260529-OB${String(ts).slice(-3)}`,
        displayName: originalName, // 폼이 매칭 시 자동 채운 스냅샷
        productId: product.id,
        acquiredFrom: "PURCHASED",
        acquiredCost: "30000",
        isAcquiredTaxable: false,
        acquiredAt: new Date(),
        status: "IN_STOCK",
      },
    });

    // 3) API 응답에 product.name 포함 확인
    const res1 = await page.request.get(
      "/api/used-items?status=IN_STOCK&limit=500",
    );
    expect(res1.ok()).toBe(true);
    const list1 = (await res1.json()) as Array<{
      id: string;
      displayName: string;
      product?: { name: string } | null;
    }>;
    const found1 = list1.find((u) => u.id === usedItem.id);
    expect(found1?.product?.name).toBe(originalName);

    // 4) 카탈로그 Product 이름 변경
    await prisma.product.update({
      where: { id: product.id },
      data: { name: renamedName },
    });

    // 5) API 재조회 — product.name 이 새 이름으로 (= 표시 이름 전파)
    const res2 = await page.request.get(
      "/api/used-items?status=IN_STOCK&limit=500",
    );
    const list2 = (await res2.json()) as Array<{
      id: string;
      displayName: string;
      product?: { name: string } | null;
    }>;
    const found2 = list2.find((u) => u.id === usedItem.id);
    // product.name 은 새 이름 (표시 헬퍼 usedItemName 이 이걸 우선 사용 → 전파)
    expect(found2?.product?.name).toBe(renamedName);
    // displayName 스냅샷은 폴백으로 원본 유지 (product null 시 대비)
    expect(found2?.displayName).toBe(originalName);

    // 6) 새 이름으로 검색해도 잡히는지 (API search OR 에 product.name 포함)
    const res3 = await page.request.get(
      `/api/used-items?status=IN_STOCK&search=${encodeURIComponent(renamedName)}`,
    );
    const list3 = (await res3.json()) as Array<{ id: string }>;
    expect(list3.some((u) => u.id === usedItem.id)).toBe(true);

    // cleanup
    await prisma.usedItem.delete({ where: { id: usedItem.id } });
    await prisma.product.delete({ where: { id: product.id } });
  });
});
