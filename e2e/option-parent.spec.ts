import { test, expect } from "@playwright/test";

/**
 * OPTION_PARENT(옵션 대표 상품) 등록 → 상세 E2E.
 *
 * 스텝 마법사(/products/new) 로 OPTION_PARENT 를 끝까지 등록하고,
 * 상세 페이지에서 OPTION_PARENT 전용 렌더(고객 옵션 부각 / 공급자 매핑 숨김)를 검증.
 *
 * 폼 단계별 검증(유형 선택·옵션 미연결 차단 등)은 product-form.spec.ts 가 담당.
 */

test.describe("OPTION_PARENT 옵션 대표 상품", () => {
  test("단품 연결 등록 → 상세 OPTION_PARENT 전용 렌더", async ({ page }) => {
    await page.goto("/products/new");
    await page.getByRole("button", { name: /옵션 대표 상품/ }).click();

    // 기본 정보 — 상품명 입력 (SKU 자동 생성)
    await page
      .getByPlaceholder("상품명을 입력하세요")
      .fill(`E2E옵션대표 ${Date.now()}`);
    await page.getByRole("button", { name: "다음" }).click();

    // 옵션 구성 스텝 — 슬롯명 + 옵션값 라벨
    await page.getByPlaceholder("예: 색상, 사이즈").fill("색상");
    await page.getByPlaceholder("옵션값 (예: 화이트)").first().fill("화이트");

    // 단품 콤보박스 열고 목록 첫 항목 선택 — DB 에 단품이 없으면 skip
    await page.getByText("연결할 단품 선택...").first().click();
    const firstOption = page.getByRole("option").first();
    const hasProduct = await firstOption
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    test.skip(!hasProduct, "개발 DB 에 연결할 단품이 없어 등록 검증 생략");
    await firstOption.click();

    // 옵션 → 확인 스텝
    await page.getByRole("button", { name: "다음" }).click();

    // 확인 스텝 → 등록
    await page.getByRole("button", { name: "등록" }).click();

    // 등록 성공 → 상세 페이지로 이동 (/products/new 는 제외)
    await page.waitForURL(/\/products\/(?!new$)[A-Za-z0-9-]+$/, {
      timeout: 20_000,
    });

    // "고객 옵션" 이 대표상품 핵심으로 부각
    await expect(
      page.getByText("고객 옵션 (대표상품 핵심)"),
    ).toBeVisible();
    // 공급자 매핑 섹션은 OPTION_PARENT 에서 숨김
    await expect(page.getByText("공급자 매핑")).toHaveCount(0);
  });
});
