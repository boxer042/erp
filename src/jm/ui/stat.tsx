import * as React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmStatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 라벨 (예: "이번 달 매출") */
  label: React.ReactNode;
  /** 메인 수치 (이미 포맷된 문자열) */
  value: React.ReactNode;
  /** 좌측 아이콘 — 선택 */
  icon?: React.ReactNode;
  /** 변화율 (양수=증가, 음수=감소). 절대값으로 표시되고 부호로 색·아이콘 결정 */
  delta?: number;
  /** delta 단위 — 기본 "%" */
  deltaUnit?: string;
  /** 비교 기준 텍스트 (예: "지난 달 대비") */
  compareLabel?: React.ReactNode;
  /** 보조 정보 — 부가 라벨 (예: "전체 N건") */
  hint?: React.ReactNode;
  /** "증가가 좋은 지표" 인지 여부. 기본 true. false 면 부호별 색 반전 (예: 결제 실패율) */
  positiveIsGood?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * KPI 카드 — 대시보드 상단의 매출/주문/방문 등 핵심 수치 표시.
 * 카드 스타일은 자체 ring/padding 포함이라 JmCard 안에 또 넣지 말 것.
 */
export const JmStat = React.forwardRef<HTMLDivElement, JmStatProps>(
  (
    {
      className,
      label,
      value,
      icon,
      delta,
      deltaUnit = "%",
      compareLabel,
      hint,
      positiveIsGood = true,
      size = "md",
      ...props
    },
    ref,
  ) => {
    const showDelta = typeof delta === "number" && !Number.isNaN(delta);
    const isUp = (delta ?? 0) > 0;
    const isDown = (delta ?? 0) < 0;

    // "증가가 좋은 지표" 일 때: up=success, down=danger
    // "감소가 좋은 지표" 일 때: up=danger, down=success
    const goodColor = positiveIsGood ? "up" : "down";
    const isGood = (goodColor === "up" && isUp) || (goodColor === "down" && isDown);
    const isBad = (goodColor === "up" && isDown) || (goodColor === "down" && isUp);

    const deltaColor = isGood
      ? "text-[var(--jm-success-fg)] bg-[var(--jm-success-bg)]"
      : isBad
        ? "text-[var(--jm-danger-fg)] bg-[var(--jm-danger-bg)]"
        : "text-[var(--jm-text-muted)] bg-[var(--jm-surface-muted)]";

    const valueClass =
      size === "lg"
        ? "text-jm-5xl"
        : size === "sm"
          ? "text-jm-2xl"
          : "text-jm-4xl";

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-2 rounded-2xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] p-5",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
            {label}
          </span>
          {icon && (
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
              {icon}
            </span>
          )}
        </div>
        <div
          className={cn(
            "font-bold tabular-nums tracking-tight text-[var(--jm-text)]",
            valueClass,
          )}
        >
          {value}
        </div>
        <div className="flex items-center gap-2 text-jm-xs">
          {showDelta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-jm-2xs font-semibold",
                deltaColor,
              )}
            >
              {isUp ? (
                <TrendingUp className="size-3" />
              ) : isDown ? (
                <TrendingDown className="size-3" />
              ) : null}
              {Math.abs(delta!).toFixed(1)}
              {deltaUnit}
            </span>
          )}
          {compareLabel && (
            <span className="text-[var(--jm-text-muted)]">{compareLabel}</span>
          )}
          {hint && !compareLabel && (
            <span className="text-[var(--jm-text-muted)]">{hint}</span>
          )}
        </div>
      </div>
    );
  },
);
JmStat.displayName = "JmStat";
