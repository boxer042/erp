import { test, expect } from "@playwright/test";

/**
 * 주문 등록(/orders/new) — POS 흐름 통합 회귀 방어.
 *
 * 검증 대상 (이번 통합 작업):
 *  - 고객 선택이 상단 맥락 바(헤더)로 이동 (점3)
 *  - 카트 → 결제 2단계 흐름 ([결제하기] → 결제 단계 → [← 카트]) (점1·점2)
 *  - 카트 액션 그리드의 [장바구니저장] 은 ERP 미지원 → 비활성 (점1)
 *  - 데이터 흐름(주문 생성) 은 건드리지 않으므로 실제 등록은 수행하지 않음
 */

test.describe("주문 등록 — POS 흐름 통합", () => {
  test("헤더 고객 선택 + 카트단계 결제하기 + 장바구니저장 비활성", async ({ page }) => {
    await page.goto("/orders/new");

    // 고객 선택 — 헤더 맥락 바 (점3)
    await expect(page.getByRole("button", { name: /고객 선택/ })).toBeVisible();

    // 카트 단계 footer — [결제하기] (빈 카트면 비활성) (점1)
    const pay = page.getByRole("button", { name: /결제하기/ });
    await expect(pay).toBeVisible();
    await expect(pay).toBeDisabled();

    // 액션 그리드 — [장바구니저장] 비활성 (ERP 미지원, 제거 X) (점1)
    const park = page.getByRole("button", { name: /장바구니저장/ });
    await expect(park).toBeVisible();
    await expect(park).toBeDisabled();
  });

  test("상품 담고 카트 → 결제 단계 전환 후 카트 복귀", async ({ page }) => {
    const res = await page.request.get("/api/products");
    const products = (await res.json()) as Array<{
      name: string;
      sellingPrice: string;
      isCanonical?: boolean;
      productType?: string;
    }>;
    const addable =
      Array.isArray(products) &&
      products.find(
        (p) =>
          Number(p.sellingPrice) > 0 &&
          !p.isCanonical &&
          p.productType !== "OPTION_PARENT",
      );
    test.skip(!addable, "직접 담을 수 있는 상품(가격>0·비대표·비옵션)이 개발 DB 에 없음");

    await page.goto("/orders/new");

    // 카탈로그에서 해당 상품 카드 클릭 → 카트 담기 (다이얼로그 없이 직접 추가)
    await page
      .getByRole("button", { name: (addable as { name: string }).name })
      .first()
      .click();

    // 담겼으면 [결제하기] 활성 → 결제 단계 전환
    const pay = page.getByRole("button", { name: /결제하기/ });
    await expect(pay).toBeEnabled();
    await pay.click();

    // 결제 단계 — 출고 방식 노출
    await expect(page.getByText("출고 방식")).toBeVisible();

    // [← 카트] 로 카트 단계 복귀
    await page.getByRole("button", { name: /카트/ }).click();
    await expect(page.getByRole("button", { name: /결제하기/ })).toBeVisible();
  });

  test("분할 출고 — 라인 '나중 배송' 표시 → 배지 + 결제단계 분할 안내", async ({
    page,
  }) => {
    const res = await page.request.get("/api/products");
    const products = (await res.json()) as Array<{
      name: string;
      sellingPrice: string;
      isCanonical?: boolean;
      productType?: string;
    }>;
    const addable = Array.isArray(products)
      ? products
          .filter(
            (p) =>
              Number(p.sellingPrice) > 0 &&
              !p.isCanonical &&
              p.productType !== "OPTION_PARENT" &&
              p.name?.trim(),
          )
          // 이름 중복 제거 — 카드 선택을 이름으로 하므로 서로 다른 이름 2개 필요
          .filter(
            (p, i, arr) => arr.findIndex((q) => q.name === p.name) === i,
          )
      : [];
    test.skip(addable.length < 2, "분할 테스트용 상품 2종(가격>0·비대표·비옵션)이 부족");

    await page.goto("/orders/new");

    // 서로 다른 상품 2개 담기 → 카트에 2개 라인
    await page.getByRole("button", { name: addable[0].name }).first().click();
    await page.getByRole("button", { name: addable[1].name }).first().click();

    // 첫 라인을 "나중 배송" 으로 표시 (상품 라인의 출고 시점 세그먼트)
    await page
      .getByText("나중 배송", { exact: true })
      .first()
      .click();

    // "택배 나중 배송" 배지 노출 → 분할 활성
    await expect(page.getByText("택배 나중 배송")).toBeVisible();

    // 결제 단계 → 분할 출고 안내 카드 노출
    await page.getByRole("button", { name: /결제하기/ }).click();
    await expect(page.getByText(/분할 출고 — 2개 주문/)).toBeVisible();
  });
});
