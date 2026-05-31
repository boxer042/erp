import { test, expect } from "@playwright/test";

/**
 * 선판매(미등록 항목) 자유 라인 — 공용 PresaleSheet UI 스모크.
 *
 * POS 카트시트와 ERP /orders/new 가 동일 PresaleSheet 를 공유하므로,
 * 페이지 기반이라 가벼운 ERP /orders/new 에서 모달·마커·배지를 한 번에 검증한다.
 * (POS 는 다중 세션이라 e2e 가 무거워 — used-items-pos.spec.ts 주석 참고 — 공용 컴포넌트로 대체 검증)
 *
 * 검증:
 *  - 카트 액션 그리드에 [선판매] 버튼 노출
 *  - 모달에서 [내상품] 비활성 + [중고상품] 활성 (설계: 중고만 활성)
 *  - 중고상품 → 품명/금액 자유 입력 → 카트에 "중고 선판매" 배지 라인 추가
 *  - 주문 미제출 (DB 미기록 → 정리 불필요)
 */

test.describe("선판매 자유 라인 — PresaleSheet 공용", () => {
  test("[선판매] → 모달(내상품 비활/중고 활성) → 중고 자유입력 → 중고 선판매 배지 라인", async ({
    page,
  }) => {
    const itemName = `테스트중고엔진_${Date.now()}`;

    await page.goto("/orders/new");

    // 1) 액션 그리드에 [선판매] 버튼 노출
    const presaleBtn = page.getByRole("button", { name: /선판매\s*미등록 항목/ });
    await expect(presaleBtn).toBeVisible();
    await presaleBtn.click();

    // 2) 모달 — 종류 선택 화면
    await expect(
      page.getByRole("heading", { name: "선판매 — 미등록 항목 추가" }),
    ).toBeVisible();

    // 내상품 = 비활성, 중고상품 = 활성 (설계 결정)
    const catalogOpt = page.getByRole("button", { name: /내상품/ });
    await expect(catalogOpt).toBeVisible();
    await expect(catalogOpt).toBeDisabled();

    const usedOpt = page.getByRole("button", { name: /중고상품/ });
    await expect(usedOpt).toBeEnabled();
    await usedOpt.click();

    // 3) 자유 입력 단계 — 품명 + 금액
    await page.getByPlaceholder(/센다이 엔진/).fill(itemName);

    // 금액 → PriceInputDialog
    await page.getByRole("button", { name: /금액 \(공급가액\)/ }).click();
    await expect(page.getByRole("heading", { name: "선판매 금액" })).toBeVisible();
    // 공급가액 입력 (PriceInputDialog 내 유일 numeric 입력 2개 중 첫 번째)
    await page.locator('input[inputmode="numeric"]').first().fill("50000");
    // "저장" — 그리드의 "장바구니저장" 과 부분일치 방지 위해 exact
    await page.getByRole("button", { name: "저장", exact: true }).click();

    // 4) 선판매 추가 → 카트 라인 생성
    const addBtn = page.getByRole("button", { name: "선판매 추가", exact: true });
    await expect(addBtn).toBeEnabled();
    await addBtn.click();

    // 5) 카트에 "중고 선판매" 배지 + 입력한 품명 (선판매 전용 placeholder 인 라인 입력)
    await expect(page.getByText("중고 선판매")).toBeVisible();
    await expect(page.getByPlaceholder(/중고 품명/)).toHaveValue(itemName);
  });
});
