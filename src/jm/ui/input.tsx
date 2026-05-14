import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/jm/lib/cn";

const inputVariants = cva(
  "w-full border bg-[var(--jm-bg)] text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none transition-colors focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        lg: "h-12 rounded-2xl px-4 text-jm-md",
        md: "h-11 rounded-xl px-4 text-jm-base",
        sm: "h-9 rounded-lg px-3 text-jm-sm",
      },
      tone: {
        default: "border-[var(--jm-border)]",
        invalid: "border-[var(--jm-danger-solid)] focus:border-[var(--jm-danger-solid)]",
      },
    },
    defaultVariants: { size: "md", tone: "default" },
  },
);

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
>;

export interface JmInputProps
  extends NativeInputProps,
    VariantProps<typeof inputVariants> {}

export const JmInput = React.forwardRef<HTMLInputElement, JmInputProps>(
  ({ className, size, tone, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ size, tone }), className)}
      {...props}
    />
  ),
);
JmInput.displayName = "JmInput";
