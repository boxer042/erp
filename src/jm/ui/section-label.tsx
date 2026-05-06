import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * 섹션 상단의 작은 헤더 라벨.
 * 자주 쓰는 상품, 진행중 N건 같은 그룹 타이틀.
 */
export const JmSectionLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]",
      className,
    )}
    {...props}
  />
));
JmSectionLabel.displayName = "JmSectionLabel";
