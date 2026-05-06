"use client";

import { useTheme } from "next-themes";
import { JmScope } from "@/jm";

/**
 * ERP next-themes 의 resolvedTheme 를 JmScope theme 로 전달해 동기화.
 * - 사용자가 ERP 라이트 모드면 jm 도 라이트, 다크면 다크
 * - "auto" 는 prefers-color-scheme 만 보므로 next-themes 의 system 모드와 어긋남 → 사용 안 함
 * - SSR 첫 페인트엔 resolvedTheme 가 undefined 라 light 로 시작 (hydration 후 정정)
 */
export function OrdersThemeScope({ children }: { children: React.ReactNode }) {
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
