import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// E2E 자격증명·설정은 .env.e2e 에서 로드 (git 미추적). .env.e2e.example 참고.
dotenv.config({ path: ".env.e2e" });

export default defineConfig({
  testDir: "./e2e",
  // 테스트가 실제 개발 DB 에 데이터를 만들므로 직렬 실행 — 경합·중복 방지
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ko-KR",
  },
  projects: [
    // 1) 로그인 → storageState 저장
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2) 저장된 세션으로 실제 테스트
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/state.json",
      },
      dependencies: ["setup"],
    },
  ],
  // 이미 dev 서버가 떠 있으면 재사용, 없으면 자동 기동
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
