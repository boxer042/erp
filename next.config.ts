import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: ["192.168.0.5", "192.168.0.*"],
  // puppeteer 는 native 바이너리(Chromium) 포함 → 번들에서 제외하고 런타임에 require
  serverExternalPackages: ["puppeteer"],
};

export default nextConfig;
