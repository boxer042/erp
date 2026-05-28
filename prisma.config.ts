import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// 기본은 .env.local (개발), PRISMA_ENV_FILE 로 운영(.env.prod) 등 다른 환경 선택 가능.
// PRISMA_ENV_FILE 명시 시 override:true — 셸/이전 env 변수보다 명시 파일이 우선되도록.
// (안 그러면 next dev 가 미리 로드한 .env.local 의 DATABASE_URL 이 .env.prod 를 가려 사고)
const envFile = process.env.PRISMA_ENV_FILE;
if (envFile) {
  dotenv.config({ path: envFile, override: true });
} else {
  dotenv.config({ path: ".env.local" });
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
