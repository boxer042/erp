"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/jm/lib/cn";

/**
 * Tooltip provider — 페이지/앱 루트에 한 번 두면 됨.
 * delay/closeDelay 등 전역 설정.
 */
export const JmTooltipProvider = TooltipPrimitive.Provider;
export const JmTooltipRoot = TooltipPrimitive.Root;
export const JmTooltipTrigger = TooltipPrimitive.Trigger;

export const JmTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof TooltipPrimitive.Popup> & {
    side?: "top" | "right" | "bottom" | "left";
    sideOffset?: number;
  }
>(({ className, side = "top", sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="isolate z-50">
      <TooltipPrimitive.Popup
        ref={ref}
        data-jm-scope
        className={cn(
          "z-50 max-w-xs rounded-lg bg-[var(--jm-text)] px-2.5 py-1.5 text-jm-xs font-medium text-[var(--jm-action-fg)] font-[family-name:var(--jm-font-sans)] shadow-[var(--jm-shadow-md)] outline-none",
          "data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
));
JmTooltipContent.displayName = "JmTooltipContent";

/**
 * 간편 Tooltip — 자식을 Trigger 로, content prop 으로 텍스트 전달.
 * 더 세밀한 제어가 필요하면 JmTooltipRoot/Trigger/Content 직접 사용.
 *
 * <JmTooltip content="삭제">
 *   <JmIconButton aria-label="삭제"><Trash2 /></JmIconButton>
 * </JmTooltip>
 */
export interface JmTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function JmTooltip({
  content,
  children,
  side = "top",
}: JmTooltipProps) {
  return (
    <JmTooltipRoot>
      <JmTooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </JmTooltipTrigger>
      <JmTooltipContent side={side}>{content}</JmTooltipContent>
    </JmTooltipRoot>
  );
}
