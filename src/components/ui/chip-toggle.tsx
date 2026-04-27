"use client";

import { cn } from "@/lib/utils";

/**
 * ChipToggle — 작은 알약 모양 칩들을 가로로 늘어놓고 단일 선택하는 컴포넌트.
 *
 * 등록·편집 폼에서 enum 값(예: 세금유형 / 결제방식 / 상태) 을 선택할 때
 * Select 드롭다운보다 시각적으로 빠르게 비교·전환할 수 있는 디자인.
 *
 * 디자인 토큰:
 *   - 높이 6 (h-6), 텍스트 11 (text-[11px]), 가로 padding 2
 *   - 선택됨: bg-primary/10 + border-primary/40 + text-primary
 *   - 미선택: border-border + text-muted-foreground + hover:bg-muted
 */
interface ChipToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** 추가 className (전체 wrapper 에 적용) */
  className?: string;
  /** 비활성화 */
  disabled?: boolean;
}

export function ChipToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  disabled,
}: ChipToggleProps<T>) {
  return (
    <div className={cn("flex gap-1 flex-wrap", className)}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2 h-6 rounded text-[11px] border transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed",
              selected
                ? "bg-primary/10 border-primary/40 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
