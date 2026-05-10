"use client";

import { useTheme } from "next-themes";
import { JmScope } from "@/jm";

/**
 * ERP next-themes 의 resolvedTheme 를 JmScope theme 로 전달해 동기화.
 */
export function SalesHistoryThemeScope({
  children,
}: {
  children: React.ReactNode;
}) {
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
