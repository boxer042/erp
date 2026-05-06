"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Calendar } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ko } from "date-fns/locale";
import { cn } from "@/jm/lib/cn";

import "react-day-picker/style.css";

export type { DateRange };

export interface JmDateRangePickerProps {
  value?: DateRange;
  onChange: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** 표시할 월 수 (가로 나란히). 기본 1 */
  numberOfMonths?: number;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

/**
 * 기간 선택 — react-day-picker 기반.
 * peer dependency: react-day-picker, date-fns
 */
export function JmDateRangePicker({
  value,
  onChange,
  placeholder = "기간 선택",
  className,
  size = "md",
  disabled,
  numberOfMonths = 1,
}: JmDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const heightClass =
    size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
  const radiusClass =
    size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
  const textClass =
    size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";

  const display = value?.from
    ? value.to && value.to.getTime() !== value.from.getTime()
      ? `${formatDate(value.from)} ~ ${formatDate(value.to)}`
      : formatDate(value.from)
    : null;

  return (
    <div className={cn("relative", heightClass, className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "relative flex w-full items-center gap-2 overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-3 text-left text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
            heightClass,
            radiusClass,
            textClass,
          )}
        >
          <Calendar className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
          <span
            className={cn(
              "flex-1 truncate tabular-nums",
              !display && "text-[var(--jm-text-subtle)]",
            )}
          >
            {display ?? placeholder}
          </span>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            align="start"
            sideOffset={6}
            className="isolate z-50"
          >
            <PopoverPrimitive.Popup
              data-jm-scope
              className={cn(
                "z-50 rounded-xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
                "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              )}
            >
              <DayPicker
                mode="range"
                locale={ko}
                selected={value}
                onSelect={onChange}
                numberOfMonths={numberOfMonths}
                showOutsideDays
                weekStartsOn={0}
                classNames={dayPickerClassNames}
              />
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

/** day-picker 9.x — class slot 오버라이드. jm 토큰 적용. */
const dayPickerClassNames: Partial<Record<string, string>> = {
  months: "flex gap-4",
  month: "flex flex-col gap-2",
  month_caption: "flex h-9 items-center justify-center text-jm-base font-semibold text-[var(--jm-text)]",
  caption_label: "tabular-nums",
  nav: "flex items-center gap-1",
  button_previous:
    "absolute left-3 top-3 inline-flex size-7 items-center justify-center rounded-lg text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
  button_next:
    "absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-lg text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
  weekdays: "grid grid-cols-7",
  weekday:
    "h-8 text-center text-jm-2xs font-medium text-[var(--jm-text-muted)]",
  week: "grid grid-cols-7",
  day: "relative size-9 p-0 text-center text-jm-sm tabular-nums",
  day_button:
    "inline-flex size-9 items-center justify-center rounded-lg text-[var(--jm-text)] outline-none hover:bg-[var(--jm-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:pointer-events-none disabled:text-[var(--jm-text-disabled)]",
  selected:
    "[&>button]:bg-[var(--jm-action)] [&>button]:text-[var(--jm-action-fg)] [&>button]:hover:bg-[var(--jm-action-hover)]",
  range_start: "[&>button]:rounded-r-none",
  range_end: "[&>button]:rounded-l-none",
  range_middle:
    "[&>button]:rounded-none [&>button]:bg-[var(--jm-surface-muted)] [&>button]:text-[var(--jm-text)] [&>button]:hover:bg-[var(--jm-border)]",
  today: "[&>button]:font-bold [&>button]:underline",
  outside: "[&>button]:text-[var(--jm-text-subtle)]",
  disabled: "opacity-30",
  hidden: "invisible",
};
