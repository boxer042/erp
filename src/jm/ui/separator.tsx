import * as React from "react";
import { cn } from "@/jm/lib/cn";

export interface JmSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** 선 대신 텍스트가 가운데 들어가는 라벨 separator (orientation=horizontal 전용) */
  label?: React.ReactNode;
}

/**
 * 구분선. 가로(기본) / 세로 / 라벨 포함.
 *
 *   <JmSeparator />
 *   <JmSeparator orientation="vertical" className="h-4" />
 *   <JmSeparator label="또는" />
 */
export const JmSeparator = React.forwardRef<HTMLDivElement, JmSeparatorProps>(
  ({ className, orientation = "horizontal", label, ...props }, ref) => {
    if (label) {
      return (
        <div
          ref={ref}
          role="separator"
          className={cn(
            "flex items-center gap-3 text-jm-2xs font-medium uppercase tracking-wider text-[var(--jm-text-muted)]",
            className,
          )}
          {...props}
        >
          <span aria-hidden className="h-px flex-1 bg-[var(--jm-border)]" />
          <span>{label}</span>
          <span aria-hidden className="h-px flex-1 bg-[var(--jm-border)]" />
        </div>
      );
    }
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={cn(
          "shrink-0 bg-[var(--jm-border)]",
          orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
          className,
        )}
        {...props}
      />
    );
  },
);
JmSeparator.displayName = "JmSeparator";
