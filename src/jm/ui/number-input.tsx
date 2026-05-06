"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

function parseDigits(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function formatThousands(digits: string): string {
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface JmNumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "size" | "prefix"
  > {
  /** 입력값 — 숫자만 (콤마 없는 raw 문자열). DB 저장 형식과 동일 */
  value: string;
  /** 변경 시 raw digits 문자열 반환. 빈 문자열 가능 */
  onValueChange: (value: string) => void;
  /** 천 단위 콤마 표시 */
  thousands?: boolean;
  /** 좌측 prefix (₩, $ 등). string 또는 ReactNode */
  prefix?: React.ReactNode;
  /** 우측 suffix (단위 표시 — 원, %, kg 등) */
  suffix?: React.ReactNode;
  /** X 버튼 노출 여부 — 기본 true. 값이 있을 때만 보임 */
  clearable?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "invalid";
}

/**
 * 숫자/가격 입력. 정수만(현재). 콤마 자동 포맷.
 *
 * 동작 원칙:
 * - 클릭/포커스 시 select-all 안 함 → 기존 값 보존 + 캐럿이 끝으로 이동
 * - X 버튼으로 일괄 삭제 (값 있을 때만 노출)
 * - onChange 는 raw digit 문자열로 통보 ("1,234,567" 표시 → "1234567" 저장)
 *
 * 사용 예:
 *   <JmNumberInput value={price} onValueChange={setPrice} thousands prefix="₩" />
 */
export const JmNumberInput = React.forwardRef<HTMLInputElement, JmNumberInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      thousands = true,
      prefix,
      suffix,
      clearable = true,
      size = "md",
      tone = "default",
      onFocus,
      onClick,
      placeholder,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const display = thousands ? formatThousands(value) : value;
    const hasValue = value.length > 0;

    const heightClass =
      size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
    const radiusClass =
      size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
    const textClass =
      size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";
    const padX =
      size === "sm" ? "px-3" : "px-4";

    // 포커스 시 select-all 방지 + 캐럿을 끝으로
    const moveCaretToEnd = () => {
      const el = innerRef.current;
      if (!el) return;
      const len = el.value.length;
      // 다음 frame에 적용 (브라우저 기본 동작 후 덮어씀)
      requestAnimationFrame(() => {
        try {
          el.setSelectionRange(len, len);
        } catch {
          // type=text 가 아니거나 비활성 상태일 때 무시
        }
      });
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      moveCaretToEnd();
      onFocus?.(e);
    };

    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
      // 사용자가 텍스트 일부를 드래그 선택 중이면 그건 보존 (selectionStart !== selectionEnd)
      const el = e.currentTarget;
      const isRangeSelected =
        el.selectionStart !== null &&
        el.selectionEnd !== null &&
        el.selectionStart !== el.selectionEnd;
      if (!isRangeSelected) {
        moveCaretToEnd();
      }
      onClick?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = parseDigits(e.target.value);
      onValueChange(raw);
    };

    const handleClear = () => {
      onValueChange("");
      // 클리어 후 다시 포커스
      requestAnimationFrame(() => innerRef.current?.focus());
    };

    return (
      <div
        className={cn(
          "relative flex w-full items-center border bg-[var(--jm-bg)] text-[var(--jm-text)] transition-colors focus-within:border-[var(--jm-border-strong)] focus-within:bg-[var(--jm-surface)] focus-within:ring-4 focus-within:ring-[var(--jm-ring)]",
          tone === "invalid"
            ? "border-[var(--jm-danger-solid)] focus-within:border-[var(--jm-danger-solid)]"
            : "border-[var(--jm-border)]",
          disabled && "cursor-not-allowed opacity-50",
          heightClass,
          radiusClass,
          textClass,
          className,
        )}
      >
        {prefix && (
          <span
            className={cn(
              "shrink-0 select-none text-[var(--jm-text-muted)] tabular-nums",
              padX,
              "pr-0",
            )}
          >
            {prefix}
          </span>
        )}
        <input
          ref={innerRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          onChange={handleChange}
          onFocus={handleFocus}
          onClick={handleClick}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none placeholder:text-[var(--jm-text-subtle)] disabled:cursor-not-allowed",
            !prefix && padX,
            !suffix && !clearable && padX,
            prefix ? "pl-1" : "",
            (suffix || (clearable && hasValue)) ? "pr-1" : "",
          )}
          {...rest}
        />
        {clearable && hasValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            tabIndex={-1}
            aria-label="입력 지우기"
            className={cn(
              "shrink-0 inline-flex items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
              size === "sm" ? "size-6 mr-1.5" : "size-7 mr-2",
            )}
          >
            <X className="size-3.5" />
          </button>
        )}
        {suffix && (
          <span
            className={cn(
              "shrink-0 select-none text-[var(--jm-text-muted)] tabular-nums",
              padX,
              "pl-0",
            )}
          >
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
JmNumberInput.displayName = "JmNumberInput";
