"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmSelectOption<T = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface JmSelectProps<T extends string = string> {
  options: JmSelectOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  align?: "start" | "center" | "end";
}

/**
 * 검색 없는 드롭다운 selector. 옵션 수가 적을 때 사용.
 * 검색이 필요하면 JmCombobox 사용.
 */
export function JmSelect<T extends string = string>({
  options,
  value,
  onChange,
  placeholder = "선택하세요",
  disabled,
  className,
  size = "md",
  align = "start",
}: JmSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  const heightClass =
    size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
  const radiusClass =
    size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
  const textClass =
    size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";

  return (
    <div className={cn("relative", heightClass, className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "relative flex w-full items-center overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-10 text-left text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
            heightClass,
            radiusClass,
            textClass,
            "max-h-full box-border",
          )}
        >
          <span
            className={cn(
              "truncate",
              !selected && "text-[var(--jm-text-subtle)]",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <span className="absolute inset-y-0 right-3 flex items-center text-[var(--jm-text-muted)]">
            <ChevronDown className="size-4" />
          </span>
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
                "z-50 flex max-h-[280px] w-(--anchor-width) flex-col overflow-y-auto rounded-xl bg-[var(--jm-surface)] p-1 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
                "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              )}
            >
              {options.length === 0 ? (
                <div className="px-3 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  옵션이 없습니다
                </div>
              ) : (
                options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-jm-base transition-colors hover:bg-[var(--jm-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50",
                        isSelected && "bg-[var(--jm-surface-muted)]",
                      )}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {isSelected && (
                          <Check className="size-4 text-[var(--jm-action)]" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[var(--jm-text)]">
                          {opt.label}
                        </span>
                        {opt.description && (
                          <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                            {opt.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
