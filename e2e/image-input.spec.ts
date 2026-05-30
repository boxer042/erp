import { test, expect } from "@playwright/test";

/**
 * 통합 이미지 입력(ImageInput / ImagePickerDrawer) + 설정 이미지관리 E2E.
 *
 * 검증 대상:
 *  - 임대자산 추가 폼의 이미지 입력 클릭 → 하단 드로워에 [1:1 썸네일][자유][라이브러리] 노출
 *    임대자산은 allowFree=false 라 [자유 비율] 버튼이 비활성
 *  - 설정 이미지관리(/settings/media) 가 버킷 탭 없이 통합 그리드 + 사용중/미사용 필터로 렌더
 */

test.describe("통합 이미지 입력", () => {
  test("임대자산 추가 — 이미지 소스 드로워 3버튼(자유 비활성)", async ({ page }) => {
    await page.goto("/rental-assets");

    // 자산 추가 드로워 열기
    await page.getByRole("button", { name: "자산 추가" }).click();

    // 이미지 미리보기(빈 상태 "사진 추가", aria-label="이미지 추가") 클릭 → 소스 드로워
    await page.getByRole("button", { name: "이미지 추가" }).first().click();

    // 하단 소스 드로워의 3버튼
    const thumb = page.getByRole("button", { name: "1:1 썸네일" });
    const free = page.getByRole("button", { name: "자유 비율" });
    const library = page.getByRole("button", { name: "라이브러리" });
    await expect(thumb).toBeVisible();
    await expect(free).toBeVisible();
    await expect(library).toBeVisible();

    // 임대자산: allowFree=false → 자유만 비활성, 나머지 활성
    await expect(free).toBeDisabled();
    await expect(thumb).toBeEnabled();
    await expect(library).toBeEnabled();
  });

  test("설정 이미지관리 — 통합 그리드 + 사용중/미사용 필터", async ({ page }) => {
    await page.goto("/settings/media");

    await expect(page.getByPlaceholder("파일명 검색...")).toBeVisible();

    // 새 통합 필터 (버킷 탭 대신) — 전체/사용중/미사용 카운트 칩
    await expect(page.getByRole("button", { name: /전체 \d+/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /사용중 \d+/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /미사용 \d+/ })).toBeVisible();

    // 제거된 버킷 탭("브랜드 로고")이 더 이상 없음
    await expect(page.getByRole("button", { name: "브랜드 로고" })).toHaveCount(0);
  });
});
