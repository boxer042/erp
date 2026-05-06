"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmCheckboxProps
  extends Omit<
    React.ComponentProps<typeof CheckboxPrimitive.Root>,
    "render"
  > {
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

/**
 * Checkbox. checked={true|false|"indeterminate"} 모두 지원.
 */
export const JmCheckbox = React.forwardRef<
  HTMLButtonElement,
  JmCheckboxProps
>(({ className, size = "md", ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "group/jm-cb inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--jm-border-strong)] bg-[var(--jm-surface)] transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] hover:border-[var(--jm-text-muted)] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:border-[var(--jm-action)] data-[checked]:bg-[var(--jm-action)] data-[indeterminate]:border-[var(--jm-action)] data-[indeterminate]:bg-[var(--jm-action)]",
      sizeClasses[size],
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--jm-action-fg)]">
      <Check
        className="size-3.5 group-data-[indeterminate]/jm-cb:hidden"
        strokeWidth={2.5}
      />
      <Minus className="hidden size-3.5 group-data-[indeterminate]/jm-cb:inline" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
JmCheckbox.displayName = "JmCheckbox";
