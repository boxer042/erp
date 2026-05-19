"use client";
import { useTheme } from "next-themes";
import { JmScope } from "@/jm";
export function TaxInvoicesThemeScope({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"}>
      {children}
    </JmScope>
  );
}
