import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/jm/lib/cn";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-all outline-none active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        cta:
          "bg-[var(--jm-action)] text-[var(--jm-action-fg)] hover:bg-[var(--jm-action-hover)] active:bg-[var(--jm-action-active)]",
        secondary:
          "bg-[var(--jm-surface-muted)] text-[var(--jm-text)] hover:bg-[var(--jm-border)]",
        outline:
          "border border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
        ghost:
          "text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
        danger:
          "bg-[var(--jm-danger-solid)] text-white hover:opacity-90",
        link:
          "text-[var(--jm-text)] underline-offset-4 hover:underline",
      },
      size: {
        lg: "h-14 rounded-2xl px-6 text-jm-md [&_svg]:size-5",
        md: "h-12 rounded-2xl px-5 text-jm-base [&_svg]:size-4",
        sm: "h-10 rounded-xl px-4 text-jm-sm [&_svg]:size-4",
        xs: "h-8 rounded-lg px-3 text-jm-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "cta", size: "md" },
  },
);

export interface JmButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const JmButton = React.forwardRef<HTMLButtonElement, JmButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
JmButton.displayName = "JmButton";

export { buttonVariants as jmButtonVariants };
