import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/jm/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]",
        outline:
          "border border-[var(--jm-border)] text-[var(--jm-text-muted)]",
        solid:
          "bg-[var(--jm-action)] text-[var(--jm-action-fg)]",
        success:
          "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]",
        warning:
          "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]",
        danger:
          "bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]",
        info:
          "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]",
        accent:
          "bg-[var(--jm-accent-bg)] text-[var(--jm-accent-fg)]",
      },
      size: {
        sm: "h-5 rounded-full px-1.5 text-jm-3xs",
        md: "h-6 rounded-full px-2 text-jm-2xs",
        lg: "h-7 rounded-full px-2.5 text-jm-xs",
      },
      shape: {
        pill: "",
        square: "",
      },
    },
    compoundVariants: [
      { shape: "square", size: "sm", className: "rounded-md" },
      { shape: "square", size: "md", className: "rounded-md" },
      { shape: "square", size: "lg", className: "rounded-lg" },
    ],
    defaultVariants: { variant: "default", size: "md", shape: "pill" },
  },
);

export interface JmBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const JmBadge = React.forwardRef<HTMLSpanElement, JmBadgeProps>(
  ({ className, variant, size, shape, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size, shape }), className)}
      {...props}
    />
  ),
);
JmBadge.displayName = "JmBadge";
