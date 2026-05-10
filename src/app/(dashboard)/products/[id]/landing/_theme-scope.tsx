"use client";

import { useTheme } from "next-themes";
import { JmScope } from "@/jm";

/**
 * 상품 랜딩 편집 페이지 — jm 디자인 시스템 적용 영역.
 * ERP next-themes 의 resolvedTheme 를 JmScope theme 로 동기화.
 */
export function LandingThemeScope({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <JmScope
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      className="flex h-full flex-col"
    >
      {children}
    </JmScope>
  );
}
