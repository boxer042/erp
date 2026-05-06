import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * 로딩 자리 표시. 페이지/카드/리스트 골격.
 * 폭·높이는 className 으로 직접 지정.
 *
 *   <JmSkeleton className="h-4 w-32" />
 *   <JmSkeleton className="h-10 w-10 rounded-full" />
 */
export const JmSkeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "animate-pulse rounded-md bg-[var(--jm-surface-muted)]",
      className,
    )}
    {...props}
  />
));
JmSkeleton.displayName = "JmSkeleton";
