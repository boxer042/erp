"use client";

import { useTheme } from "next-themes";
import { JmScope } from "@/jm";

export function SupplierProductsThemeScope({ children }: { children: React.ReactNode }) {
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
