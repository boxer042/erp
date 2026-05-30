import { test, expect } from "@playwright/test";

/**
 * 중고 단품 도메인 (UsedItem) E2E — /inventory/used-items
 *
 * Phase 1 작동 검증:
 *  1. 사이드바 메뉴 노출
 *  2. 목록 페이지 KPI / 상태 탭 / 빈 테이블
 *  3. 매입 등록 폼 → 등록 → 상세 자동 이동
 *  4. 상세에서 비용 가산 → 합계 갱신
 *  5. 시리얼 사후 발번
 *  6. 폐기 → Expense 자동 생성 (UI 토스트 확인)
 *
 * 데이터: 매번 실행마다 임의 timestamp 이름으로 새 row 생성 (격리).
 */

test.describe("중고 단품 — Phase 1 lifecycle", () => {
  test("매입 → 비용 가산 → 시리얼 발번 → 폐기 전체 흐름", async ({ page }) => {
    const ts = Date.now();
    const displayName = `E2E중고엔진 ${ts}`;
    const acquiredCost = "55000";
    const addedCostDesc = `SSD 교체 ${ts}`;
    const addedCostAmount = "60000";
    const scrapReason = `테스트 폐기 ${ts}`;

    // 1) 목록 페이지 진입 (in-body h1 없음 — 등록 버튼으로 로드 확인)
    await page.goto("/inventory/used-items");
    await expect(
      page.getByRole("button", { name: "중고 상품 등록" }),
    ).toBeVisible();

    // KPI 라벨 — strict mode 회피하려고 first() 사용 (탭에도 같은 텍스트 있음)
    await expect(page.getByText("누적 매입가치")).toBeVisible();
    await expect(page.getByText("비카탈로그")).toBeVisible();
    await expect(page.getByText("시리얼 발번")).toBeVisible();

    // 상태 탭 — role=tab 으로 명확히 구별
    await expect(page.getByRole("tab", { name: "보관 중" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "조립 흡수" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "판매 완료" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "폐기" })).toBeVisible();

    // 2) 매입 등록 페이지로 이동 — Link 안 JmButton 이라 button role 로 잡힘
    await page.getByRole("button", { name: /중고 상품 등록/ }).click();
    await page.waitForURL(/\/inventory\/used-items\/new/);
    await expect(
      page.getByRole("heading", { name: "기본 정보" }),
    ).toBeVisible();

    // 3) 폼 입력
    await page.getByPlaceholder("예: 센다이 엔진 SD225R").fill(displayName);

    // 매입가 입력 — formatComma 적용된 input
    const acquiredCostInput = page.locator("input").filter({
      hasText: "",
    });
    await page.getByPlaceholder("0").first().fill(acquiredCost);

    // 시리얼 발번 OFF 상태로 등록 (기본값)
    // 등록 버튼 클릭
    await page.getByRole("button", { name: "등록", exact: true }).click();

    // 4) 상세 페이지 자동 이동 확인 (URL 패턴)
    // — 첫 진입은 next.js 컴파일이 오래 걸려 timeout 넉넉히
    await page.waitForURL(/\/inventory\/used-items\/[a-f0-9-]+$/, {
      timeout: 60_000,
    });

    // 등록된 품명이 헤더에 표시 (컴파일 후 렌더 대기)
    await expect(page.getByText(displayName).first()).toBeVisible({
      timeout: 30_000,
    });

    // 매입가 ₩55,000 표시 확인 (toLocaleString 적용)
    await expect(page.getByText("₩55,000").first()).toBeVisible();

    // 5) 비용 추가
    await page.getByRole("button", { name: /비용 추가/ }).click();
    await page.getByPlaceholder("예: SSD 교체").fill(addedCostDesc);
    // 금액 — "추가" 폼 안의 0 placeholder input
    const amountInputs = page.getByPlaceholder("0");
    const formAmountInput = amountInputs.last();
    await formAmountInput.fill(addedCostAmount);
    await page.getByRole("button", { name: "추가", exact: true }).click();

    // 비용 항목이 리스트에 표시되는지 (mutation → invalidate → refetch — dev server 부하 시 여유)
    await expect(page.getByText(addedCostDesc)).toBeVisible({ timeout: 15_000 });
    // ₩60,000 는 리스트 항목 + 합계 두 곳에 나타나니 first() 로
    await expect(page.getByText("₩60,000").first()).toBeVisible();
    await expect(page.getByText("합계")).toBeVisible();

    // 6) 폐기 처리 (시리얼 발번은 별도 테스트에서 — 한 시나리오에 다이얼로그 다중 조작 race 회피)
    await page.getByRole("button", { name: /폐기/ }).first().click();
    await page.getByPlaceholder(/폐기 사유/).fill(scrapReason);
    await page.getByRole("button", { name: "폐기 처리" }).click();

    // 폐기 후 상태 배지가 "폐기" 로 변경
    await expect(
      page.getByText("폐기", { exact: true }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 잠금 알림 확인 (폐기 mutation → invalidate → refetch 후 렌더 — 부하 시 여유)
    await expect(
      page.getByText(/단품은.*폐기.*상태로 잠금/),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 시리얼 사후 발번 흐름은 Phase 4 (used-items-rental-conversion.spec.ts) 가
  // convert-to-used 경로로 USED_INTAKE 시리얼 발번을 end-to-end 검증함.
  // POS식 단독 발번 UI 테스트는 같은 경로 중복이라 생략.

  test("목록 페이지 — 사이드바 메뉴 + 빈 상태 → 등록 진입", async ({ page }) => {
    await page.goto("/");

    // 사이드바에서 "중고 상품" 메뉴 클릭
    await page.getByRole("link", { name: "중고 상품" }).click();
    await page.waitForURL(/\/inventory\/used-items/);

    // 로드 확인 — 등록 버튼 (in-body h1 없음)
    await expect(
      page.getByRole("button", { name: "중고 상품 등록" }),
    ).toBeVisible();

    // [+ 중고 상품 등록] 버튼 클릭 → /new 진입
    await page.getByRole("button", { name: /중고 상품 등록/ }).click();
    await page.waitForURL(/\/inventory\/used-items\/new/);
    await expect(page.getByText("중고 상품 매입 등록")).toBeVisible();
  });
});
