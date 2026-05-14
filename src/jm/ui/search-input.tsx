"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmSearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md" | "lg";
  /** value/onChange 외에 명시적 clear 콜백 — value 비우는 처리만 하면 됨 */
  onClear?: () => void;
}

/**
 * 좌측 search 아이콘 + 우측 X 버튼이 붙은 검색 인풋.
 * IME(한글) 안전을 위해 onKeyDown 핸들러를 직접 추가할 때 isComposing 체크 필수.
 */
export const JmSearchInput = React.forwardRef<HTMLInputElement, JmSearchInputProps>(
  ({ className, size = "md", onClear, value, ...props }, ref) => {
    const heightClass =
      size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
    const radiusClass =
      size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
    const textClass =
      size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";
    const iconLeft = size === "sm" ? "left-2.5" : "left-3";
    const iconRight = size === "sm" ? "right-2" : "right-2.5";
    const padLeft = size === "sm" ? "pl-8" : "pl-10";
    const padRight = value ? (size === "sm" ? "pr-8" : "pr-10") : "pr-3";

    return (
      <div className={cn("relative w-full", heightClass, className)}>
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--jm-text-subtle)]",
            iconLeft,
          )}
        >
          <Search className="size-4" />
        </span>
        <input
          ref={ref}
          type="search"
          value={value}
          className={cn(
            "w-full border border-[var(--jm-border)] bg-[var(--jm-bg)] text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none transition-colors focus:border-[var(--jm-border-strong)] focus:bg-[var(--jm-surface)] focus:ring-2 focus:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden",
            heightClass,
            radiusClass,
            textClass,
            padLeft,
            padRight,
          )}
          {...props}
        />
        {value && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="검색어 지우기"
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
              iconRight,
              size === "sm" ? "size-6" : "size-7",
            )}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  },
);
JmSearchInput.displayName = "JmSearchInput";
