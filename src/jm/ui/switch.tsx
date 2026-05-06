"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/jm/lib/cn";

export interface JmSwitchProps
  extends Omit<
    React.ComponentProps<typeof SwitchPrimitive.Root>,
    "render"
  > {
  size?: "sm" | "md" | "lg";
}

const trackSize = {
  sm: "h-5 w-9",
  md: "h-6 w-11",
  lg: "h-7 w-12",
};

const thumbSize = {
  sm: "size-4 data-[checked]:translate-x-4",
  md: "size-5 data-[checked]:translate-x-5",
  lg: "size-6 data-[checked]:translate-x-5",
};

/**
 * 토글 스위치. 체크박스 대비 즉시 적용되는 설정에 적합 (다크모드, 알림 on/off 등).
 */
export const JmSwitch = React.forwardRef<HTMLButtonElement, JmSwitchProps>(
  ({ className, size = "md", ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[var(--jm-border-strong)] transition-colors outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-[var(--jm-action)]",
        trackSize[size],
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none ml-0.5 inline-block rounded-full bg-[var(--jm-surface)] shadow-[var(--jm-shadow-sm)] transition-transform",
          thumbSize[size],
        )}
      />
    </SwitchPrimitive.Root>
  ),
);
JmSwitch.displayName = "JmSwitch";
