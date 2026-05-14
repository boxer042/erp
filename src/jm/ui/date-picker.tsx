"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayPicker, type Matcher } from "react-day-picker";
import { ko } from "date-fns/locale";
import { cn } from "@/jm/lib/cn";

import "react-day-picker/style.css";

/**
 * 단일 날짜 선택 — react-day-picker 기반.
 * popover 통합 trigger 와 인라인 위젯(JmCalendar) 두 가지 제공.
 *
 * 주의: day-picker 9.x default css 의 specificity 가 (0,3,0) 이라 tailwind class 로
 * margin/width 등 layout 속성을 못 이김. inline `styles` prop 으로 강제하는 게 유일한 방법.
 */

const CELL = 36;

const dayPickerStyles: Partial<Record<string, React.CSSProperties>> = {
  root: {
    ["--rdp-accent-color" as string]: "var(--jm-text)",
    // navLayout="around" 일 때 caption 양쪽에 nav button 자리 비워주는 변수
    ["--rdp-nav_button-width" as string]: "28px",
    ["--rdp-nav_button-height" as string]: "28px",
  },
  months: { display: "flex", gap: 16 },
  month: {
    position: "relative", // navLayout="around" 의 button absolute 기준점
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  month_caption: {
    height: CELL,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // ⚠️ button_previous/next 는 day-picker 9.x 가 style prop 을 forward 하지 않음 (버그).
  // 위치는 classNames 에서 `!` prefix (!important) 로 강제해야 함.
  weekdays: {},
  weekday: {
    width: CELL,
    height: CELL,
    padding: 0,
    textAlign: "center",
  },
  week: {},
  day: {
    width: CELL,
    height: CELL,
    padding: 0,
    textAlign: "center",
  },
  day_button: {
    width: CELL,
    height: CELL,
    border: 0,
    padding: 0,
  },
};

const dayPickerClassNames: Partial<Record<string, string>> = {
  caption_label: "tabular-nums text-jm-base font-semibold text-[var(--jm-text)]",
  button_previous:
    "!absolute !left-0 !top-0 !size-7 inline-flex items-center justify-center rounded-lg text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
  button_next:
    "!absolute !right-0 !top-0 !size-7 inline-flex items-center justify-center rounded-lg text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
  weekday: "text-jm-2xs font-medium text-[var(--jm-text-muted)]",
  day: "text-jm-sm tabular-nums",
  day_button:
    "inline-flex items-center justify-center rounded-lg text-[var(--jm-text)] outline-none hover:bg-[var(--jm-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:pointer-events-none disabled:text-[var(--jm-text-disabled)]",
  selected:
    "[&>button]:bg-[var(--jm-action)] [&>button]:text-[var(--jm-action-fg)] [&>button]:hover:bg-[var(--jm-action-hover)]",
  today: "[&>button]:font-bold [&>button]:underline",
  outside: "[&>button]:text-[var(--jm-text-subtle)]",
  disabled: "opacity-30",
  hidden: "invisible",
};

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

// ─── JmDatePicker — popover + trigger 통합 ─────────────────────────────────

export interface JmDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** 선택 가능한 최소 날짜 */
  fromDate?: Date;
  /** 선택 가능한 최대 날짜 */
  toDate?: Date;
  /**
   * 추가로 선택 불가능한 날짜 매처. fromDate/toDate 와 함께 적용된다.
   * 함수 형태 `(date: Date) => boolean` 또는 react-day-picker `Matcher`/`Matcher[]` 모두 허용.
   * 예: occupied 날짜 범위들 비활성화.
   */
  disabledDates?: Matcher | Matcher[];
}

export function JmDatePicker({
  value,
  onChange,
  placeholder = "날짜 선택",
  className,
  size = "md",
  disabled,
  fromDate,
  toDate,
  disabledDates,
}: JmDatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const heightClass = size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
  const radiusClass =
    size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
  const textClass =
    size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";

  const display = value ? formatDate(value) : null;

  const mergedDisabled = React.useMemo<Matcher | Matcher[] | undefined>(() => {
    const base: Matcher[] = [];
    if (fromDate) base.push({ before: fromDate });
    if (toDate) base.push({ after: toDate });
    if (disabledDates) {
      if (Array.isArray(disabledDates)) base.push(...disabledDates);
      else base.push(disabledDates);
    }
    return base.length === 0 ? undefined : base;
  }, [fromDate, toDate, disabledDates]);

  return (
    <div className={cn("relative", heightClass, className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "relative flex w-full items-center gap-2 overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-3 text-left text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
            heightClass,
            radiusClass,
            textClass,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
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
                mode="single"
                locale={ko}
                selected={value}
                onSelect={(d) => {
                  onChange(d);
                  if (d) setOpen(false);
                }}
                showOutsideDays
                weekStartsOn={0}
                navLayout="around"
                disabled={mergedDisabled}
                styles={dayPickerStyles}
                classNames={dayPickerClassNames}
              />
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}

// ─── JmCalendar — popover 없이 인라인 위젯 ────────────────────────────────

export interface JmCalendarProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  className?: string;
  fromDate?: Date;
  toDate?: Date;
  /** 표시할 월 수 (가로 나란히). 기본 1 */
  numberOfMonths?: number;
  /** 추가로 비활성화할 날짜 매처. fromDate/toDate 와 함께 적용된다. */
  disabledDates?: Matcher | Matcher[];
}

export function JmCalendar({
  value,
  onChange,
  className,
  fromDate,
  toDate,
  numberOfMonths = 1,
  disabledDates,
}: JmCalendarProps) {
  const mergedDisabled = React.useMemo<Matcher | Matcher[] | undefined>(() => {
    const base: Matcher[] = [];
    if (fromDate) base.push({ before: fromDate });
    if (toDate) base.push({ after: toDate });
    if (disabledDates) {
      if (Array.isArray(disabledDates)) base.push(...disabledDates);
      else base.push(disabledDates);
    }
    return base.length === 0 ? undefined : base;
  }, [fromDate, toDate, disabledDates]);

  return (
    <div
      className={cn(
        "rounded-xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)]",
        className,
      )}
    >
      <DayPicker
        mode="single"
        locale={ko}
        selected={value}
        onSelect={onChange}
        numberOfMonths={numberOfMonths}
        showOutsideDays
        weekStartsOn={0}
        navLayout="around"
        disabled={mergedDisabled}
        styles={dayPickerStyles}
        classNames={dayPickerClassNames}
      />
    </div>
  );
}
