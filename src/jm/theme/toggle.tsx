"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/jm/lib/cn";
import type { JmTheme } from "./scope";

export interface JmThemeToggleProps {
  value: JmTheme;
  onChange: (theme: JmTheme) => void;
  /** light 만 / dark 만 토글하려면 auto 옵션 숨김 */
  showAuto?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * 라이트/다크/자동 3택 세그먼트 토글.
 * JmScope 의 theme prop 과 함께 사용.
 *
 *   const [theme, setTheme] = useState<JmTheme>("light");
 *   <JmScope theme={theme}>
 *     <JmThemeToggle value={theme} onChange={setTheme} />
 *     ...
 *   </JmScope>
 */
export function JmThemeToggle({
  value,
  onChange,
  showAuto = true,
  size = "md",
  className,
}: JmThemeToggleProps) {
  const options: Array<{ v: JmTheme; icon: React.ReactNode; label: string }> = [
    { v: "light", icon: <Sun />, label: "라이트" },
    { v: "dark", icon: <Moon />, label: "다크" },
    ...(showAuto
      ? [{ v: "auto" as JmTheme, icon: <Monitor />, label: "자동" }]
      : []),
  ];

  const heightClass = size === "sm" ? "h-7" : "h-8";
  const innerSize = size === "sm" ? "size-5" : "size-6";

  return (
    <div
      role="radiogroup"
      aria-label="테마"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-[var(--jm-surface-muted)] p-0.5",
        heightClass,
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => onChange(opt.v)}
            className={cn(
              "inline-flex items-center justify-center rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] [&_svg]:size-3.5",
              innerSize,
              active
                ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-[var(--jm-shadow-sm)]"
                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
            )}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
