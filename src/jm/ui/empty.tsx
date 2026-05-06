import * as React from "react";
import { cn } from "@/jm/lib/cn";

export interface JmEmptyProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * 빈 상태 디스플레이.
 * - 아이콘 / 제목 / 설명 / 액션 버튼 슬롯
 * - 검색 결과 없음, 첫 사용 안내, 데이터 없는 카드 등에 재사용
 */
export const JmEmpty = React.forwardRef<HTMLDivElement, JmEmptyProps>(
  ({ className, icon, title, description, action, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
          {icon}
        </div>
      )}
      {title && (
        <p className="text-jm-md font-semibold text-[var(--jm-text)]">
          {title}
        </p>
      )}
      {description && (
        <p className="max-w-sm text-jm-sm text-[var(--jm-text-muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
      {children}
    </div>
  ),
);
JmEmpty.displayName = "JmEmpty";
