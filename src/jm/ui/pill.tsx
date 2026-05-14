import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/jm/lib/cn";

/**
 * Toggle/filter pill — 카테고리, 상태 필터, 세그먼트 컨트롤 등에 사용.
 * `active` boolean 으로 선택 상태 표시.
 */
const pillVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        md: "h-9 px-4 text-jm-sm",
        sm: "h-7 px-3 text-jm-xs",
        lg: "h-10 px-5 text-jm-base",
      },
      active: {
        true: "bg-[var(--jm-action)] text-[var(--jm-action-fg)]",
        false:
          "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] hover:bg-[var(--jm-border)] hover:text-[var(--jm-text)]",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
);

export interface JmPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof pillVariants> {}

export const JmPill = React.forwardRef<HTMLButtonElement, JmPillProps>(
  ({ className, size, active, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(pillVariants({ size, active }), className)}
      {...props}
    />
  ),
);
JmPill.displayName = "JmPill";
