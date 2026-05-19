import { test, expect } from "@playwright/test";

/**
 * 상품 상세 페이지 시각 정리 E2E — /products/[id]
 *
 * 검증 대상:
 *  - 상단 스티키 그룹 내비 (개요·구성·옵션·미디어·이력) 노출
 *  - 그룹 헤더 노출
 *  - 신규 섹션 (상위 상품 / 부속 사용 수리 이력) 노출
 */

test.describe("상품 상세 — 시각 정리", () => {
  test("그룹 내비 + 그룹 헤더 + 신규 섹션 노출", async ({ page }) => {
    // 상품 목록 API 로 첫 상품 id 확보 — DB 에 상품이 없으면 skip
    const res = await page.request.get("/api/products");
    const products = (await res.json()) as Array<{ id: string }>;
    test.skip(
      !Array.isArray(products) || products.length === 0,
      "개발 DB 에 상품이 없어 상세 검증 생략",
    );
    await page.goto(`/products/${products[0].id}`);
    // 변형 상품이면 부모로 redirect — 정착될 때까지 대기
    await page.waitForURL(/\/products\/[0-9a-f]{8}-[0-9a-f-]+$/, {
      timeout: 20_000,
    });

    // 상단 그룹 내비 — 모든 상품 유형 공통 그룹
    await expect(page.getByRole("button", { name: "개요" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "구성·옵션" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "미디어" })).toBeVisible();
    await expect(page.getByRole("button", { name: "이력" })).toBeVisible();

    // 그룹 헤더 (h2)
    await expect(
      page.getByRole("heading", { name: "개요", exact: true }),
    ).toBeVisible();

    // 신규 섹션 — 항상 렌더 (비어 있으면 안내문)
    await expect(page.getByText("상위 상품").first()).toBeVisible();
    await expect(
      page.getByText("부속 사용 수리 이력").first(),
    ).toBeVisible();

    // 내비 클릭 → 해당 그룹으로 스크롤
    await page.getByRole("button", { name: "이력" }).click();
    await expect(
      page.getByRole("heading", { name: "이력", exact: true }),
    ).toBeInViewport();
  });
});
