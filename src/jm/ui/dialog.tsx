"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

type Size = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export const JmDialog = DialogPrimitive.Root;
export const JmDialogTrigger = DialogPrimitive.Trigger;
export const JmDialogClose = DialogPrimitive.Close;
export const JmDialogPortal = DialogPrimitive.Portal;

export interface JmDialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Popup> {
  size?: Size;
  showCloseButton?: boolean;
}

/**
 * 가운데 정렬 모달. 확인 다이얼로그·간단한 폼·정보 패널 용도.
 * 사이드/풀스크린 시트는 JmDrawer / JmComboboxModal 참고.
 */
export function JmDialogContent({
  className,
  children,
  size = "md",
  showCloseButton = true,
  ...props
}: JmDialogContentProps) {
  return (
    <JmDialogPortal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200",
          "data-starting-style:opacity-0 data-ending-style:opacity-0",
          "supports-backdrop-filter:backdrop-blur-sm",
        )}
      />
      <DialogPrimitive.Popup
        data-jm-scope
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--jm-surface)] text-[var(--jm-text)] font-[family-name:var(--jm-font-sans)] shadow-[var(--jm-shadow-lg)] border border-[var(--jm-border)] outline-none flex flex-col max-h-[90vh]",
          "transition-[opacity,transform] duration-200 ease-out",
          "data-starting-style:opacity-0 data-starting-style:scale-95",
          "data-ending-style:opacity-0 data-ending-style:scale-95",
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="닫기"
            className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-full text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] outline-none"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </JmDialogPortal>
  );
}

export const JmDialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex shrink-0 flex-col gap-1 px-5 pb-3 pt-5 pr-12",
      className,
    )}
    {...props}
  />
));
JmDialogHeader.displayName = "JmDialogHeader";

export const JmDialogTitle = React.forwardRef<
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
JmDialogTitle.displayName = "JmDialogTitle";

export const JmDialogDescription = React.forwardRef<
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
JmDialogDescription.displayName = "JmDialogDescription";

export const JmDialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex-1 min-h-0 overflow-y-auto px-5 py-3",
      className,
    )}
    {...props}
  />
));
JmDialogBody.displayName = "JmDialogBody";

export const JmDialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex shrink-0 items-center justify-end gap-2 px-5 pb-5 pt-3",
      className,
    )}
    {...props}
  />
));
JmDialogFooter.displayName = "JmDialogFooter";
