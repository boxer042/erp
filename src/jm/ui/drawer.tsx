"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

type Side = "right" | "left" | "bottom" | "top";
type Size = "sm" | "md" | "lg" | "xl" | "full";

const sideClasses: Record<Side, string> = {
  right: "inset-y-0 right-0 h-full border-l border-[var(--jm-border)]",
  left: "inset-y-0 left-0 h-full border-r border-[var(--jm-border)]",
  bottom: "inset-x-0 bottom-0 w-full border-t border-[var(--jm-border)] rounded-t-3xl",
  top: "inset-x-0 top-0 w-full border-b border-[var(--jm-border)] rounded-b-3xl",
};

const sideEnter: Record<Side, string> = {
  right: "data-starting-style:translate-x-full data-ending-style:translate-x-full",
  left: "data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
  bottom: "data-starting-style:translate-y-full data-ending-style:translate-y-full",
  top: "data-starting-style:-translate-y-full data-ending-style:-translate-y-full",
};

const sizeForSide = (side: Side, size: Size): string => {
  if (side === "right" || side === "left") {
    if (size === "sm") return "w-[320px]";
    if (size === "md") return "w-[420px]";
    if (size === "lg") return "w-[560px]";
    if (size === "xl") return "w-[720px]";
    return "w-full";
  }
  // bottom / top
  if (size === "sm") return "h-[40vh]";
  if (size === "md") return "h-[60vh]";
  if (size === "lg") return "h-[80vh]";
  if (size === "xl") return "h-[90vh]";
  return "h-[100vh]";
};

export const JmDrawer = DialogPrimitive.Root;
export const JmDrawerTrigger = DialogPrimitive.Trigger;
export const JmDrawerClose = DialogPrimitive.Close;
export const JmDrawerPortal = DialogPrimitive.Portal;

export interface JmDrawerContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Popup> {
  side?: Side;
  size?: Size;
  showCloseButton?: boolean;
  /**
   * 상단 드래그 핸들 (시각적 표시, 실제 드래그는 안 됨).
   * bottom 일 땐 기본 true, 그 외엔 기본 false.
   */
  dragHandle?: boolean;
  /** 백드롭 클래스 커스텀 — 보통 안 건드림 */
  backdropClassName?: string;
}

/**
 * 모달성 사이드/바텀 시트.
 * - side: 어느 쪽에서 열릴지 (right/left/bottom/top)
 * - size: 너비/높이 — sm/md/lg/xl/full. bottom·top 일 때 vh 기준
 * - 자동으로 [data-jm-scope] 부착 → 토큰 cascade 보장
 * - 자동으로 jm 폰트 적용
 */
export function JmDrawerContent({
  className,
  children,
  side = "right",
  size = "md",
  showCloseButton = true,
  dragHandle,
  backdropClassName,
  ...props
}: JmDrawerContentProps) {
  const showHandle = dragHandle ?? side === "bottom";
  return (
    <JmDrawerPortal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/30 transition-opacity duration-200",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
          // backdrop-filter 는 모바일(터치)에서 탭/리페인트 시 깜빡임을 유발 → fine pointer(데스크탑)에서만 블러 적용
          "pointer-fine:supports-backdrop-filter:backdrop-blur-sm",
          backdropClassName,
        )}
      />
      <DialogPrimitive.Popup
        data-jm-scope
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col bg-[var(--jm-surface)] text-[var(--jm-text)] font-[family-name:var(--jm-font-sans)] shadow-[var(--jm-shadow-lg)] outline-none",
          "transition-transform duration-300 ease-out",
          sideClasses[side],
          sizeForSide(side, size),
          sideEnter[side],
          className,
        )}
        {...props}
      >
        {showHandle && (
          <div className="flex shrink-0 justify-center pt-3 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-[var(--jm-border-strong)]" />
          </div>
        )}
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="닫기"
            className="absolute right-4 top-4 z-10 inline-flex size-8 items-center justify-center rounded-full text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] outline-none"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </JmDrawerPortal>
  );
}

export const JmDrawerHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex shrink-0 flex-col gap-1 border-b border-[var(--jm-border)] px-5 py-4 pr-12",
      className,
    )}
    {...props}
  />
));
JmDrawerHeader.displayName = "JmDrawerHeader";

export const JmDrawerTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-jm-lg font-bold tracking-tight text-[var(--jm-text)]",
      className,
    )}
    {...props}
  />
));
JmDrawerTitle.displayName = "JmDrawerTitle";

export const JmDrawerDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "text-jm-sm text-[var(--jm-text-muted)]",
      className,
    )}
    {...props}
  />
));
JmDrawerDescription.displayName = "JmDrawerDescription";

/** 스크롤되는 본문 영역. flex-1 + overflow-y-auto. */
export const JmDrawerBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex-1 min-h-0 overflow-y-auto px-5 py-4",
      className,
    )}
    {...props}
  />
));
JmDrawerBody.displayName = "JmDrawerBody";

/** 항상 하단 고정. flex-row 정렬. iOS safe-area-inset-bottom 자동 적용. */
export const JmDrawerFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    style={{
      paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)",
      ...style,
    }}
    className={cn(
      "flex shrink-0 items-center justify-end gap-2 border-t border-[var(--jm-border)] px-5 pt-3 bg-[var(--jm-surface)]",
      className,
    )}
    {...props}
  />
));
JmDrawerFooter.displayName = "JmDrawerFooter";
