"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/jm/lib/cn";

export const JmTabs = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof TabsPrimitive.Root>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Root
    ref={ref}
    className={cn("flex flex-col gap-3", className)}
    {...props}
  />
));
JmTabs.displayName = "JmTabs";

/**
 * 탭 리스트 컨테이너.
 * variant="line" — 하단 인디케이터 라인 (기본)
 * variant="pill" — 활성 탭이 둥근 알약 모양
 */
type TabsListVariant = "line" | "pill";

export interface JmTabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List> {
  variant?: TabsListVariant;
}

export const JmTabsList = React.forwardRef<HTMLDivElement, JmTabsListProps>(
  ({ className, variant = "line", ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn(
        "inline-flex items-center gap-1",
        variant === "line" &&
          "border-b border-[var(--jm-border)]",
        variant === "pill" &&
          "rounded-xl bg-[var(--jm-surface-muted)] p-1",
        className,
      )}
      {...props}
    />
  ),
);
JmTabsList.displayName = "JmTabsList";

export const JmTabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof TabsPrimitive.Tab>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Tab
    ref={ref}
    className={cn(
      "group/jm-tab relative inline-flex h-9 items-center justify-center gap-1.5 px-4 text-jm-sm font-medium text-[var(--jm-text-muted)] transition-colors outline-none hover:text-[var(--jm-text)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
      // line variant — 하단 인디케이터
      "data-[parent-variant=line]:rounded-none",
      // pill variant — 활성 시 흰 배경
      "data-[parent-variant=pill]:rounded-lg",
      "data-[selected]:text-[var(--jm-text)]",
      "data-[parent-variant=pill]:data-[selected]:bg-[var(--jm-surface)] data-[parent-variant=pill]:data-[selected]:shadow-[var(--jm-shadow-sm)]",
      className,
    )}
    {...props}
  />
));
JmTabsTrigger.displayName = "JmTabsTrigger";

/**
 * line variant 일 때 활성 탭 아래에 슬라이드되는 라인.
 * <JmTabsList variant="line">...<JmTabsIndicator /></JmTabsList> 패턴.
 */
export const JmTabsIndicator = React.forwardRef<
  HTMLSpanElement,
  React.ComponentProps<typeof TabsPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Indicator
    ref={ref}
    className={cn(
      "absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) bg-[var(--jm-action)] transition-[transform,width] duration-200",
      className,
    )}
    {...props}
  />
));
JmTabsIndicator.displayName = "JmTabsIndicator";

export const JmTabsPanel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof TabsPrimitive.Panel>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Panel
    ref={ref}
    className={cn("outline-none", className)}
    {...props}
  />
));
JmTabsPanel.displayName = "JmTabsPanel";
