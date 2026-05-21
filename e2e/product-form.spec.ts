import { test, expect } from "@playwright/test";

/**
 * 상품 등록 폼 (스텝 마법사) E2E — /products/new
 *
 * 검증 대상:
 *  - 유형 선택 화면 → 유형 클릭 시 스텝 마법사 진입
 *  - 기본 정보 스텝 검증 (상품명 비우면 다음 차단)
 *  - 스텝 이동 (다음 / 이전)
 *  - OPTION_PARENT 옵션 스텝 — 옵션값 미연결 시 다음 차단
 */

test.describe("상품 등록 폼 — 스텝 마법사", () => {
  test("유형 선택 → 완제품 (거래처-기본 순서) + 기본 정보 검증", async ({
    page,
  }) => {
    await page.goto("/products/new");

    // 유형 선택 화면
    await expect(
      page.getByText("어떤 상품을 등록하시겠어요?"),
    ).toBeVisible();

    // 완제품 선택 — FINISHED/PARTS 는 거래처 연결이 먼저
    await page.getByRole("button", { name: /완제품/ }).click();
    await expect(page.getByText("거래처 연결").first()).toBeVisible();

    // 거래처 미지정 상태로 다음 — supplier 스텝은 skippable
    await page.getByRole("button", { name: "다음" }).click();

    // 두 번째 스텝 = 기본 정보 — 상품명 입력 필드 노출
    const nameInput = page.getByPlaceholder("상품명을 입력하세요");
    await expect(nameInput).toBeVisible();

    // 상품명 비운 채 다음 → 차단 토스트
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("상품명을 입력해주세요")).toBeVisible();

    // 상품명 입력 후 다음 → 다음 스텝(가격) 진입 = 기본 정보 필드 사라짐
    await nameInput.fill(`E2E완제품 ${Date.now()}`);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(nameInput).toBeHidden();

    // 이전 → 기본 정보로 복귀
    await page.getByRole("button", { name: "이전" }).click();
    await expect(nameInput).toBeVisible();
  });

  test("OPTION_PARENT — 옵션 스텝에서 미연결 옵션값은 다음 차단", async ({
    page,
  }) => {
    await page.goto("/products/new");
    await page.getByRole("button", { name: /옵션 대표 상품/ }).click();

    // 기본 정보 — 상품명 입력
    await page
      .getByPlaceholder("상품명을 입력하세요")
      .fill(`E2E옵션대표 ${Date.now()}`);
    await page.getByRole("button", { name: "다음" }).click();

    // 옵션 구성 스텝
    await expect(page.getByText("고객 옵션").first()).toBeVisible();
    await expect(page.getByPlaceholder("예: 색상, 사이즈")).toBeVisible();
    await expect(
      page.getByPlaceholder("옵션값 (예: 화이트)").first(),
    ).toBeVisible();

    // 슬롯명 입력, 옵션값은 단품 미연결 상태로 다음 → 차단
    await page.getByPlaceholder("예: 색상, 사이즈").fill("색상");
    await page.getByPlaceholder("옵션값 (예: 화이트)").first().fill("화이트");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/옵션값을 1개 이상/)).toBeVisible();
  });
});
