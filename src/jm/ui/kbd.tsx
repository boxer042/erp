import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * 키보드 키 표시. 단축키 안내, 명령 팔레트 등.
 *
 *   <JmKbd>↵</JmKbd>
 *   <JmKbd>⌘</JmKbd> + <JmKbd>K</JmKbd>
 */
export const JmKbd = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "inline-flex h-5 min-w-5 items-center justify-center rounded bg-[var(--jm-surface-muted)] px-1.5 font-[family-name:var(--jm-font-mono)] text-jm-2xs font-medium text-[var(--jm-text-subtle)]",
      className,
    )}
    {...props}
  />
));
JmKbd.displayName = "JmKbd";
