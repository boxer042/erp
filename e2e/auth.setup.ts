import { test as setup, expect } from "@playwright/test";

/**
 * 인증 setup — Supabase 이메일/비번 로그인 후 세션을 storageState 로 저장.
 * 이후 모든 테스트는 이 상태를 재사용해 로그인 단계를 건너뛴다.
 *
 * .env.e2e 에 E2E_EMAIL / E2E_PASSWORD 를 채워야 한다 (.env.e2e.example 참고).
 */
const authFile = "e2e/.auth/state.json";

setup("로그인", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL / E2E_PASSWORD 가 없습니다 — .env.e2e 에 테스트 계정을 채우세요.",
    );
  }

  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "로그인" }).click();

  // 로그인 성공 시 홈(/)으로 이동
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/$/);

  await page.context().storageState({ path: authFile });
});
