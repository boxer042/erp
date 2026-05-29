"use client";

import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * JmTimePicker — 시간 선택 입력. native <input type="time"> 위에 jm 토큰 스타일을 입힌
 * 컴포넌트. POS·수리 등 시각 입력이 필요한 곳에서 사용.
 *
 * - value/onChange: "HH:mm" 문자열 (24h)
 * - size: sm / md / lg (다른 jm input 들과 일관)
 * - 우측에 시계 아이콘 (시각 입력임을 명시)
 * - 24시간제 (한국 운영 환경 표준)
 *
 * 모바일에선 브라우저 native 시간 picker(룰러/wheel) 가 자동 노출 — 별도 모달 불필요.
 * 데스크톱에선 hh:mm 텍스트 + spinner.
 */
export interface JmTimePickerProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "size" | "type" | "value" | "onChange"
  > {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
}

const HEIGHT_BY_SIZE: Record<NonNullable<JmTimePickerProps["size"]>, string> = {
  sm: "h-9",
  md: "h-11",
  lg: "h-12",
};

const TEXT_BY_SIZE: Record<NonNullable<JmTimePickerProps["size"]>, string> = {
  sm: "text-jm-sm",
  md: "text-jm-base",
  lg: "text-jm-md",
};

export const JmTimePicker = React.forwardRef<HTMLInputElement, JmTimePickerProps>(
  ({ value, onChange, size = "md", className, disabled, ...props }, ref) => {
    return (
      <div className={cn("relative inline-flex w-full", className)}>
        <input
          ref={ref}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-10 tabular-nums text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
            HEIGHT_BY_SIZE[size],
            TEXT_BY_SIZE[size],
          )}
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[var(--jm-text-muted)]"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 6v4l2.5 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    );
  },
);
JmTimePicker.displayName = "JmTimePicker";
