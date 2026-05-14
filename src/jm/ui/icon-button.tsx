import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/jm/lib/cn";

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost:
          "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] active:bg-[var(--jm-border)]",
        solid:
          "bg-[var(--jm-action)] text-[var(--jm-action-fg)] hover:bg-[var(--jm-action-hover)]",
        outline:
          "border border-[var(--jm-border)] text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
      },
      size: {
        sm: "size-8 rounded-lg [&_svg]:size-4",
        md: "size-10 rounded-full [&_svg]:size-5",
        lg: "size-12 rounded-full [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface JmIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  "aria-label": string;
}

export const JmIconButton = React.forwardRef<
  HTMLButtonElement,
  JmIconButtonProps
>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(iconButtonVariants({ variant, size }), className)}
    {...props}
  />
));
JmIconButton.displayName = "JmIconButton";
