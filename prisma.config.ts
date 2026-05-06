import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// 기본은 .env.local (개발), PRISMA_ENV_FILE 로 운영(.env.prod) 등 다른 환경 선택 가능.
// dotenv 는 이미 set 된 env var 은 덮어쓰지 않으므로, 셸에서 export 한 값이 항상 우선.
dotenv.config({ path: process.env.PRISMA_ENV_FILE ?? ".env.local" });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
