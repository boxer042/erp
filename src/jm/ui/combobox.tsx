"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Check, ChevronsUpDown, Plus, Search, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmComboboxItem {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface JmComboboxProps<T extends JmComboboxItem = JmComboboxItem> {
  items: T[];
  value: string;
  onChange: (item: T) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  clearable?: boolean;
  onClear?: () => void;
  onCreateNew?: (query: string) => void;
  createLabel?: (query: string) => React.ReactNode;
  matches?: (item: T, query: string) => boolean;
  renderItem?: (item: T) => React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const defaultMatches = <T extends JmComboboxItem>(item: T, query: string) => {
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    (item.description?.toLowerCase().includes(q) ?? false)
  );
};

/**
 * 검색 가능한 select. 옵션 수가 많거나 텍스트로 찾는 게 더 빠를 때 사용.
 * onCreateNew 가 있으면 일치하는 항목 없을 때 "검색어 추가" 버튼이 노출됨.
 * IME(한글) 입력 안전.
 */
export function JmCombobox<T extends JmComboboxItem = JmComboboxItem>({
  items,
  value,
  onChange,
  placeholder = "선택하세요",
  searchPlaceholder = "검색...",
  emptyMessage = "결과가 없습니다",
  disabled,
  clearable = false,
  onClear,
  onCreateNew,
  createLabel,
  matches = defaultMatches,
  renderItem,
  size = "md",
  className,
}: JmComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selected = items.find((i) => i.id === value);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((i) => matches(i, q));
  }, [items, query, matches]);

  const heightClass =
    size === "lg" ? "h-12" : size === "sm" ? "h-9" : "h-11";
  const radiusClass =
    size === "lg" ? "rounded-2xl" : size === "sm" ? "rounded-lg" : "rounded-xl";
  const textClass =
    size === "lg" ? "text-jm-md" : size === "sm" ? "text-jm-sm" : "text-jm-base";

  // 열릴 때 input 자동 포커스
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  const handleSelect = (item: T) => {
    onChange(item);
    setOpen(false);
  };

  const showCreate =
    onCreateNew && query.trim() && !filtered.some((i) => i.label === query.trim());

  return (
    <div className={cn("relative", heightClass, className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger
          disabled={disabled}
          className={cn(
            "relative flex w-full items-center overflow-hidden border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-4 pr-10 text-left text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] disabled:cursor-not-allowed disabled:opacity-50",
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
          <span className="absolute inset-y-0 right-2 flex items-center gap-1 text-[var(--jm-text-muted)]">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear?.();
                }}
                className="flex size-6 items-center justify-center rounded-full hover:bg-[var(--jm-surface-muted)]"
                aria-label="선택 해제"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4" />
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
                "z-50 flex max-h-[320px] w-(--anchor-width) flex-col overflow-hidden rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
                "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              )}
            >
              {/* 검색 input */}
              <div className="flex items-center gap-2 border-b border-[var(--jm-border)] px-3 py-2">
                <Search className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (filtered.length > 0) {
                        handleSelect(filtered[0]);
                      } else if (showCreate) {
                        onCreateNew?.(query.trim());
                        setOpen(false);
                      }
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="h-8 w-full bg-transparent text-jm-base text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none"
                />
              </div>

              {/* 결과 리스트 */}
              <div className="flex-1 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    {emptyMessage}
                  </div>
                ) : (
                  filtered.map((item) => {
                    const isSelected = item.id === value;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={item.disabled}
                        onClick={() => handleSelect(item)}
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
                        {renderItem ? (
                          renderItem(item)
                        ) : (
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[var(--jm-text)]">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                                {item.description}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* 새로 만들기 — Modal/Drawer 와 시각 통일: Plus 아이콘 + "검색어" + "새로 등록" */}
              {showCreate && (
                <button
                  type="button"
                  onClick={() => {
                    onCreateNew?.(query.trim());
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 border-t border-[var(--jm-border)] bg-[var(--jm-surface-subtle)] px-3 py-2.5 text-left text-jm-sm font-medium text-[var(--jm-text)] transition-colors hover:bg-[var(--jm-surface-muted)]"
                >
                  <Plus className="size-4 shrink-0 text-[var(--jm-text-muted)]" />
                  <span className="flex-1 truncate">
                    {createLabel ? (
                      createLabel(query.trim())
                    ) : (
                      <>
                        <span className="font-semibold">
                          &ldquo;{query.trim()}&rdquo;
                        </span>
                        <span className="ml-1 text-[var(--jm-text-muted)]">
                          새로 등록
                        </span>
                      </>
                    )}
                  </span>
                  <kbd className="shrink-0 rounded bg-[var(--jm-surface-muted)] px-1.5 py-0.5 text-jm-2xs font-[family-name:var(--jm-font-mono)] text-[var(--jm-text-subtle)]">
                    ↵
                  </kbd>
                </button>
              )}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
