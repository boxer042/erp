import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Next.js 16 가 next.config.ts 를 ESM 으로 컴파일 — __dirname 없음. import.meta.url 로 대체.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  allowedDevOrigins: ["192.168.0.5", "192.168.0.*"],
  // puppeteer 는 native 바이너리(Chromium) 포함 → 번들에서 제외하고 런타임에 require
  serverExternalPackages: ["puppeteer"],
};

export default nextConfig;
