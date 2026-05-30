"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Clock } from "lucide-react";
import { cn } from "@/jm/lib/cn";

/**
 * JmTimePicker — 시간 선택. JmDatePicker 와 동일한 popover + 토큰 패턴.
 *
 * native <input type="time"> 은 데스크톱에서 브라우저 자체 시계/스피너 indicator 가
 * 우측에 끼어 커스텀 아이콘과 겹치고, hh/mm 세그먼트를 타이핑/스피너로 조작해야 해
 * POS(터치+데스크톱) UX 가 나쁨 → 시/분 2열 스크롤 컬럼으로 교체.
 *
 * - value/onChange: "HH:mm" 문자열 (24h)
 * - size: sm / md / lg (다른 jm input 들과 일관)
 * - minuteStep: 분 컬럼 간격 (기본 1)
 * - trigger 클릭 → popover 에 [시][분] 컬럼. 항목 탭 시 즉시 onChange (popover 유지).
 *   바깥 클릭/ESC 로 닫힘. "지금" 으로 현재 시각 한 번에 설정.
 */
export interface JmTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md" | "lg";
  minuteStep?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const ROW = 36; // 컬럼 항목 높이 (h-9)
const LIST_H = 180; // 스크롤 영역 높이 (5행 노출)
const PAD_Y = (LIST_H - ROW) / 2; // 첫/끝 항목도 가운데 정렬되도록 위·아래 여백

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseTime(value: string): { hh: number; mm: number } {
  const [h, m] = (value ?? "").split(":");
  return { hh: Number.parseInt(h, 10), mm: Number.parseInt(m, 10) };
}

interface ColumnProps {
  label: string;
  options: number[];
  /** 선택된 option 의 index (없으면 -1) */
  selectedIndex: number;
  onSelect: (n: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function TimeColumn({ label, options, selectedIndex, onSelect, scrollRef }: ColumnProps) {
  return (
    <div className="flex flex-col">
      <span className="pb-1 text-center text-jm-2xs font-medium uppercase tracking-wider text-[var(--jm-text-muted)]">
        {label}
      </span>
      <div
        ref={scrollRef}
        className="w-14 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: LIST_H }}
      >
        <div style={{ height: PAD_Y }} aria-hidden />
        {options.map((n, i) => {
          const selected = i === selectedIndex;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onSelect(n)}
              className={cn(
                "flex w-full items-center justify-center rounded-lg text-jm-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]",
                selected
                  ? "bg-[var(--jm-action)] font-semibold text-[var(--jm-action-fg)] hover:bg-[var(--jm-action-hover)]"
                  : "text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
              )}
              style={{ height: ROW }}
            >
              {pad2(n)}
            </button>
          );
        })}
        <div style={{ height: PAD_Y }} aria-hidden />
      </div>
    </div>
  );
}

export function JmTimePicker({
  value,
  onChange,
  size = "md",
  minuteStep = 1,
  placeholder = "시간 선택",
  className,
  disabled,
}: JmTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const hourScrollRef = React.useRef<HTMLDivElement>(null);
  const minScrollRef = React.useRef<HTMLDivElement>(null);

  const heightClass = size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
  const radiusClass =
    size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
  const textClass =
    size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";

  const hours = React.useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = React.useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep],
  );

  const { hh, mm } = parseTime(value);
  const hasHour = Number.isFinite(hh);
  const hasMin = Number.isFinite(mm);
  const display = hasHour && hasMin ? `${pad2(hh)}:${pad2(mm)}` : null;

  const hourIndex = hasHour ? hours.indexOf(hh) : -1;
  const minIndex = hasMin ? minutes.indexOf(mm) : -1;

  const emit = (h: number, m: number) => onChange(`${pad2(h)}:${pad2(m)}`);
  const selectHour = (h: number) => emit(h, hasMin ? mm : 0);
  const selectMinute = (m: number) => emit(hasHour ? hh : 0, m);

  // popover 열릴 때 선택값을 각 컬럼 가운데로 스크롤
  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      if (hourIndex >= 0) hourScrollRef.current?.scrollTo({ top: hourIndex * ROW });
      if (minIndex >= 0) minScrollRef.current?.scrollTo({ top: minIndex * ROW });
    });
    return () => cancelAnimationFrame(raf);
    // open 시점에만 정렬 (스크롤 중 재정렬 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={cn("relative", heightClass, className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "relative flex w-full items-center gap-2 overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-3 text-left text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] data-[popup-open]:border-[var(--jm-border-strong)] disabled:cursor-not-allowed disabled:opacity-50",
            heightClass,
            radiusClass,
            textClass,
          )}
        >
          <Clock className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
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
                "z-50 rounded-xl bg-[var(--jm-surface)] p-2 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
                "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              )}
            >
              <div className="flex gap-1 px-1">
                <TimeColumn
                  label="시"
                  options={hours}
                  selectedIndex={hourIndex}
                  onSelect={selectHour}
                  scrollRef={hourScrollRef}
                />
                <div className="my-1 w-px self-stretch bg-[var(--jm-border)]" aria-hidden />
                <TimeColumn
                  label="분"
                  options={minutes}
                  selectedIndex={minIndex}
                  onSelect={selectMinute}
                  scrollRef={minScrollRef}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  emit(now.getHours(), now.getMinutes());
                }}
                className="mt-1.5 flex h-9 w-full items-center justify-center rounded-lg border-t border-[var(--jm-border)] text-jm-sm font-medium text-[var(--jm-text-muted)] outline-none transition-colors hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
              >
                지금
              </button>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
