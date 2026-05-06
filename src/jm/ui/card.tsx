import * as React from "react";
import { cn } from "@/jm/lib/cn";

export const JmCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-2xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)]",
      className,
    )}
    {...props}
  />
));
JmCard.displayName = "JmCard";

export const JmCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-1 border-b border-[var(--jm-border)] px-5 py-4",
      className,
    )}
    {...props}
  />
));
JmCardHeader.displayName = "JmCardHeader";

export const JmCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-jm-md font-bold tracking-tight text-[var(--jm-text)]",
      className,
    )}
    {...props}
  />
));
JmCardTitle.displayName = "JmCardTitle";

export const JmCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-jm-xs text-[var(--jm-text-muted)]",
      className,
    )}
    {...props}
  />
));
JmCardDescription.displayName = "JmCardDescription";

export const JmCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-5 py-4", className)}
    {...props}
  />
));
JmCardContent.displayName = "JmCardContent";

export const JmCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-end gap-2 border-t border-[var(--jm-border)] px-5 py-3",
      className,
    )}
    {...props}
  />
));
JmCardFooter.displayName = "JmCardFooter";
