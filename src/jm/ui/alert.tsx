import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

const alertVariants = cva(
  "relative flex gap-3 rounded-xl border px-4 py-3",
  {
    variants: {
      variant: {
        info: "border-[var(--jm-info-bg)] bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)]",
        success:
          "border-[var(--jm-success-bg)] bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]",
        warning:
          "border-[var(--jm-warning-bg)] bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]",
        danger:
          "border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] text-[var(--jm-danger-fg)]",
        neutral:
          "border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text)]",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const defaultIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  neutral: Info,
};

export interface JmAlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  /** 아이콘 직접 지정 — 미지정 시 variant 기본 아이콘 */
  icon?: React.ReactNode;
  /** 닫기 버튼 — onDismiss 가 있으면 자동 노출 */
  onDismiss?: () => void;
  /** 우측 액션 슬롯 (버튼 등) */
  action?: React.ReactNode;
}

/**
 * 인라인 알림 박스 — info/success/warning/danger/neutral.
 * 토스트와 다르게 페이지 흐름 안에 정착해 표시.
 */
export const JmAlert = React.forwardRef<HTMLDivElement, JmAlertProps>(
  (
    { className, variant = "info", title, icon, onDismiss, action, children, ...props },
    ref,
  ) => {
    const IconComp = defaultIcons[variant ?? "info"];
    const renderedIcon = icon ?? <IconComp className="size-5 shrink-0" />;

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        <span className="mt-0.5">{renderedIcon}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {title && (
            <p className="text-jm-sm font-semibold leading-snug">{title}</p>
          )}
          {children && (
            <div className="text-jm-sm leading-snug opacity-90">{children}</div>
          )}
        </div>
        {action && <div className="ml-auto shrink-0">{action}</div>}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="닫기"
            className="ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  },
);
JmAlert.displayName = "JmAlert";
