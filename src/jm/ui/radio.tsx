"use client";

import * as React from "react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "@/jm/lib/cn";

export const JmRadioGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RadioGroupPrimitive>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive
    ref={ref}
    className={cn("flex flex-col gap-2", className)}
    {...props}
  />
));
JmRadioGroup.displayName = "JmRadioGroup";

const sizeClasses = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export interface JmRadioProps
  extends Omit<React.ComponentProps<typeof RadioPrimitive.Root>, "render"> {
  size?: keyof typeof sizeClasses;
}

export const JmRadio = React.forwardRef<HTMLButtonElement, JmRadioProps>(
  ({ className, size = "md", ...props }, ref) => (
    <RadioPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--jm-border-strong)] bg-[var(--jm-surface)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] hover:border-[var(--jm-text-muted)] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:border-[var(--jm-action)]",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="flex items-center justify-center">
        <span
          className={cn(
            "rounded-full bg-[var(--jm-action)]",
            size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5",
          )}
        />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  ),
);
JmRadio.displayName = "JmRadio";
