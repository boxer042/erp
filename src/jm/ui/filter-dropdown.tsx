"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";
import { JmBadge } from "./badge";

export interface JmFilterOption {
  value: string;
  label: string;
  description?: string;
}

export interface JmFilterDropdownProps {
  label: string;
  options: JmFilterOption[];
  /** 선택된 값들 */
  value: string[];
  onChange: (value: string[]) => void;
  /** 검색 가능 여부. 옵션 8개 이상이면 자동으로 활성화 권장 */
  searchable?: boolean;
  /** 최대 표시 항목 (스크롤). 기본 320px max-height */
  maxHeight?: string;
  size?: "sm" | "md";
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * 다중 선택 필터 dropdown — 테이블 툴바에서 카테고리/상태/태그 등을 다중 선택.
 * 트리거에 선택 카운트 배지가 붙고, 팝오버 안에서 체크박스 형태 리스트.
 */
export function JmFilterDropdown({
  label,
  options,
  value,
  onChange,
  searchable,
  maxHeight = "320px",
  size = "md",
  align = "start",
  className,
}: JmFilterDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const clear = () => onChange([]);

  const heightClass = size === "sm" ? "h-9" : "h-10";
  const textClass = size === "sm" ? "text-jm-xs" : "text-jm-sm";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--jm-border-strong)] px-3 font-medium text-[var(--jm-text)] transition-colors outline-none hover:bg-[var(--jm-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]",
          heightClass,
          textClass,
          value.length > 0 && "border-solid border-[var(--jm-action)] bg-[var(--jm-surface)]",
          className,
        )}
      >
        <span>{label}</span>
        {value.length > 0 ? (
          <>
            <span aria-hidden className="h-3 w-px bg-[var(--jm-border)]" />
            <JmBadge size="sm" variant="solid">
              {value.length}
            </JmBadge>
          </>
        ) : (
          <ChevronDown className="size-3.5 text-[var(--jm-text-muted)]" />
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align={align}
          sideOffset={6}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            data-jm-scope
            className={cn(
              "z-50 flex min-w-[220px] flex-col overflow-hidden rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            )}
          >
            {(searchable || options.length >= 8) && (
              <div className="border-b border-[var(--jm-border)] px-3 py-2">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="검색..."
                  className="h-8 w-full bg-transparent text-jm-sm text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none"
                />
              </div>
            )}
            <div
              className="overflow-y-auto p-1"
              style={{ maxHeight }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-jm-xs text-[var(--jm-text-muted)]">
                  결과 없음
                </div>
              ) : (
                filtered.map((opt) => {
                  const isOn = value.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggle(opt.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-jm-sm transition-colors hover:bg-[var(--jm-surface-muted)]",
                        isOn && "bg-[var(--jm-surface-muted)]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isOn
                            ? "border-[var(--jm-action)] bg-[var(--jm-action)] text-[var(--jm-action-fg)]"
                            : "border-[var(--jm-border-strong)] bg-[var(--jm-surface)]",
                        )}
                      >
                        {isOn && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[var(--jm-text)]">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="truncate text-jm-2xs text-[var(--jm-text-muted)]">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {value.length > 0 && (
              <div className="border-t border-[var(--jm-border)]">
                <button
                  type="button"
                  onClick={clear}
                  className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-jm-xs font-medium text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
                >
                  <X className="size-3.5" />
                  필터 초기화
                </button>
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
