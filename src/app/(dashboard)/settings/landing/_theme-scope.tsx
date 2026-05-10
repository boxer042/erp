"use client";

import { useTheme } from "next-themes";
import { JmScope } from "@/jm";

/**
 * 랜딩 설정(공통 헤더/푸터) 페이지 — jm 디자인 시스템 적용 영역.
 * ERP next-themes 의 resolvedTheme 를 JmScope theme 로 동기화.
 */
export function SettingsLandingThemeScope({ children }: { children: React.ReactNode }) {
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
