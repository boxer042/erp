import * as React from "react";
import { cn } from "@/jm/lib/cn";

export const JmTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 text-jm-base text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none transition-colors focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
JmTextarea.displayName = "JmTextarea";
