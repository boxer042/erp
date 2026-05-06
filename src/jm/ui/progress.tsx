"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "@/jm/lib/cn";

export interface JmProgressProps
  extends Omit<React.ComponentProps<typeof ProgressPrimitive.Root>, "render"> {
  size?: "sm" | "md" | "lg";
  /** 색상 */
  tone?: "default" | "success" | "warning" | "danger";
  /** 우측에 % 라벨 */
  showLabel?: boolean;
}

/**
 * 선형 progress bar — 결정적 진행도 (value 지정) 또는 indeterminate.
 */
export const JmProgress = React.forwardRef<HTMLDivElement, JmProgressProps>(
  ({ className, size = "md", tone = "default", showLabel, value, ...props }, ref) => {
    const heightClass =
      size === "lg" ? "h-2.5" : size === "sm" ? "h-1.5" : "h-2";
    const indicatorColor =
      tone === "success"
        ? "bg-[var(--jm-success-solid)]"
        : tone === "warning"
          ? "bg-[var(--jm-warning-solid)]"
          : tone === "danger"
            ? "bg-[var(--jm-danger-solid)]"
            : "bg-[var(--jm-action)]";

    return (
      <div className="flex items-center gap-3">
        <ProgressPrimitive.Root
          ref={ref}
          value={value}
          className={cn("relative w-full", className)}
          {...props}
        >
          <ProgressPrimitive.Track
            className={cn(
              "relative w-full overflow-hidden rounded-full bg-[var(--jm-surface-muted)]",
              heightClass,
            )}
          >
            <ProgressPrimitive.Indicator
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-out",
                indicatorColor,
              )}
            />
          </ProgressPrimitive.Track>
        </ProgressPrimitive.Root>
        {showLabel && typeof value === "number" && (
          <span className="shrink-0 text-jm-xs font-medium tabular-nums text-[var(--jm-text-muted)]">
            {Math.round(value)}%
          </span>
        )}
      </div>
    );
  },
);
JmProgress.displayName = "JmProgress";
