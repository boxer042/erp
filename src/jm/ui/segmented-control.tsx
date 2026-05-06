"use client";

import * as React from "react";
import { cn } from "@/jm/lib/cn";

export interface JmSegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface JmSegmentedControlProps<T extends string = string> {
  options: JmSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | "lg";
  /** 가용 공간 채우기 — 각 segment 가 균등 분할 */
  fullWidth?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * 작은 토글 그룹 — JmPill 보다 컴팩트, JmTabs 보다 가벼움.
 * 좁은 영역(카드 헤더, 툴바)의 view 토글에 적합.
 *
 *   <JmSegmentedControl
 *     options={[{ value: "list", label: "목록" }, { value: "grid", label: "격자" }]}
 *     value={view}
 *     onChange={setView}
 *   />
 */
export function JmSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth,
  className,
  ariaLabel,
}: JmSegmentedControlProps<T>) {
  const heightClass =
    size === "lg" ? "h-10" : size === "sm" ? "h-7" : "h-8";
  const radiusClass =
    size === "lg" ? "rounded-xl" : "rounded-lg";
  const innerRadius =
    size === "lg" ? "rounded-lg" : "rounded-md";
  const textClass =
    size === "lg" ? "text-jm-base" : size === "sm" ? "text-jm-2xs" : "text-jm-xs";
  const padX = size === "sm" ? "px-2" : "px-3";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-stretch gap-0.5 bg-[var(--jm-surface-muted)] p-0.5",
        radiusClass,
        heightClass,
        fullWidth && "w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
              innerRadius,
              padX,
              textClass,
              fullWidth && "flex-1",
              active
                ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-[var(--jm-shadow-sm)]"
                : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]",
              "[&_svg]:size-3.5",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
