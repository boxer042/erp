import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/jm/lib/cn";

const sizeClasses = {
  xs: "size-3",
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
  xl: "size-8",
};

const toneClasses = {
  default: "text-[var(--jm-text-muted)]",
  action: "text-[var(--jm-action)]",
  inverted: "text-[var(--jm-action-fg)]",
};

export interface JmSpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: keyof typeof sizeClasses;
  tone?: keyof typeof toneClasses;
  label?: string;
}

/**
 * 회전 로딩 스피너. 버튼 안 / 카드 안 / 인라인 로딩 표시.
 */
export const JmSpinner = React.forwardRef<HTMLSpanElement, JmSpinnerProps>(
  ({ className, size = "md", tone = "default", label, ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-label={label ?? "로딩 중"}
      className={cn(
        "inline-flex items-center justify-center",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <Loader2 className={cn("animate-spin", sizeClasses[size])} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  ),
);
JmSpinner.displayName = "JmSpinner";
