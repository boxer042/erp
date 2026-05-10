"use client";

import * as React from "react";
import { ScrollArea } from "@base-ui/react/scroll-area";
import { cn } from "@/jm/lib/cn";

/**
 * 오버레이 스크롤바 — 콘텐츠 영역을 잡아먹지 않고 위에 떠 있음.
 * base-ui ScrollArea 기반. hover/scroll 시에만 표시 (showOn="hover" 기본).
 *
 *   <JmScrollArea className="h-full">
 *     <div>긴 콘텐츠...</div>
 *   </JmScrollArea>
 *
 * 단순한 wrapper 가 필요하면 그대로 사용.
 * 부모가 layout 결정자이면 height 100% 전달 (위 예시처럼 className 으로).
 */

export interface JmScrollAreaProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  children?: React.ReactNode;
  /** 스크롤바 두께 (px). 기본 6. */
  thumbSize?: number;
  /** "hover" — hover/scroll 시에만 표시 (기본). "always" — 항상 표시. */
  showOn?: "hover" | "always";
  /** viewport 추가 클래스 */
  viewportClassName?: string;
  /** 가로 스크롤바도 보일지. 기본 false (sidebar 등 vertical-only 용도가 대다수) */
  horizontal?: boolean;
}

export function JmScrollArea({
  children,
  className,
  thumbSize = 6,
  showOn = "hover",
  viewportClassName,
  horizontal = false,
  ...props
}: JmScrollAreaProps) {
  const visibilityClass =
    showOn === "always"
      ? "opacity-100"
      : "opacity-0 transition-opacity duration-150 data-[hovering]:opacity-100 data-[scrolling]:opacity-100";

  return (
    <ScrollArea.Root
      className={cn("relative h-full w-full overflow-hidden", className)}
      {...props}
    >
      <ScrollArea.Viewport
        className={cn(
          "h-full w-full overscroll-contain [&>div]:!block",
          viewportClassName,
        )}
      >
        {children}
      </ScrollArea.Viewport>
      {/* 세로 스크롤바 */}
      <ScrollArea.Scrollbar
        orientation="vertical"
        style={{ width: thumbSize + 2 }}
        className={cn(
          "absolute top-0.5 right-0.5 bottom-0.5 z-10 flex touch-none select-none justify-center rounded-full",
          visibilityClass,
        )}
      >
        <ScrollArea.Thumb
          style={{ width: thumbSize }}
          className="rounded-full bg-[var(--jm-border-strong)] transition-colors hover:bg-[var(--jm-text-muted)]"
        />
      </ScrollArea.Scrollbar>
      {horizontal && (
        <ScrollArea.Scrollbar
          orientation="horizontal"
          style={{ height: thumbSize + 2 }}
          className={cn(
            "absolute right-0.5 bottom-0.5 left-0.5 z-10 flex touch-none select-none items-center rounded-full",
            visibilityClass,
          )}
        >
          <ScrollArea.Thumb
            style={{ height: thumbSize }}
            className="rounded-full bg-[var(--jm-border-strong)] transition-colors hover:bg-[var(--jm-text-muted)]"
          />
        </ScrollArea.Scrollbar>
      )}
    </ScrollArea.Root>
  );
}
JmScrollArea.displayName = "JmScrollArea";
