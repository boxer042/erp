import { test, expect } from "@playwright/test";

/**
 * OPTION_PARENT(옵션 대표 상품) E2E.
 *
 * 검증 대상:
 *  #2 — 등록 폼에 옵션+단품 연결 섹션이 있고, 옵션 0개로는 등록 차단
 *  #4 — 등록된 OPTION_PARENT 상세에서 가격/공급/재고 섹션이 숨고
 *       "고객 옵션" 이 핵심으로 부각
 */

test.describe("OPTION_PARENT 옵션 대표 상품", () => {
  test("#2 등록 폼 — 옵션 구성 섹션 노출 + 빈 옵션 등록 차단", async ({
    page,
  }) => {
    await page.goto("/products/new");

    // 상품 유형 선택 → 옵션 대표 상품
    await page.getByRole("button", { name: /옵션 대표 상품/ }).click();

    // STEP 4 옵션 구성 섹션이 나타나는지
    await expect(
      page.getByText("옵션 구성", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByPlaceholder("예: 색상, 사이즈")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "옵션값 추가" }),
    ).toBeVisible();

    // 상품명 입력 (SKU 는 자동 생성)
    await page
      .getByPlaceholder("상품명을 입력하세요")
      .fill(`E2E옵션대표 ${Date.now()}`);

    // 옵션값을 비운 채 등록 시도 → 차단 토스트
    await page.getByRole("button", { name: "등록" }).click();
    await expect(page.getByText(/옵션값을 1개 이상/)).toBeVisible();
  });

  test("#2·#4 단품 연결 등록 → 상세 OPTION_PARENT 전용 렌더", async ({
    page,
  }) => {
    await page.goto("/products/new");
    await page.getByRole("button", { name: /옵션 대표 상품/ }).click();

    await page
      .getByPlaceholder("상품명을 입력하세요")
      .fill(`E2E옵션대표 ${Date.now()}`);

    // 옵션값 라벨
    await page.getByPlaceholder("옵션값 (예: 화이트)").first().fill("화이트");

    // 단품 콤보박스 열고 목록 첫 항목 선택 — DB 에 단품이 없으면 skip
    await page.getByText("연결할 단품 선택...").first().click();
    const firstOption = page.getByRole("option").first();
    const hasProduct = await firstOption
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    test.skip(!hasProduct, "개발 DB 에 연결할 단품이 없어 등록 검증 생략");
    await firstOption.click();

    await page.getByRole("button", { name: "등록" }).click();

    // 등록 성공 → 상세 페이지로 이동 (/products/new 는 제외)
    await page.waitForURL(/\/products\/(?!new$)[A-Za-z0-9-]+$/, {
      timeout: 20_000,
    });

    // #4 — "고객 옵션" 이 대표상품 핵심으로 부각
    await expect(
      page.getByText("고객 옵션 (대표상품 핵심)"),
    ).toBeVisible();
    // #4 — 공급자 매핑 섹션은 OPTION_PARENT 에서 숨김
    await expect(page.getByText("공급자 매핑")).toHaveCount(0);
  });
});
