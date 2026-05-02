"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose,
} from "@/components/ui/drawer";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import { ChevronsUpDown, CornerDownLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResponsiveComboboxProps<T> {
  items: T[];
  value: string;
  getItemId: (item: T) => string;
  matches: (item: T, query: string) => boolean;
  onSelect: (item: T) => void;
  onCreateNew?: (name: string) => void;
  renderTrigger?: (selected: T | undefined) => React.ReactNode;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  selectedLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  mobileTitle?: string;
  clearable?: boolean;
  onClear?: () => void;
  disabled?: boolean;
}

export function ResponsiveCombobox<T>({
  items,
  value,
  getItemId,
  matches,
  onSelect,
  onCreateNew,
  renderTrigger,
  renderItem,
  selectedLabel,
  placeholder = "선택...",
  searchPlaceholder = "검색...",
  emptyLabel = "결과 없음",
  mobileTitle,
  clearable = false,
  onClear,
  disabled = false,
}: ResponsiveComboboxProps<T>) {
  const isMobile = useIsCompactDevice();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const mobileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !isMobile) return;
    setSearch(selectedLabel ?? "");
    const t = setTimeout(() => {
      const input = mobileInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }, 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  const trimmed = search.trim();
  const selected = items.find((i) => getItemId(i) === value);
  const filtered = trimmed ? items.filter((i) => matches(i, trimmed)) : items;

  const triggerCreate = (name: string) => {
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNew?.(name), 0);
  };

  const handleSelect = (item: T) => {
    onSelect(item);
    setOpen(false);
    setSearch("");
  };

  const handleOpenChange = (v: boolean) => {
    if (v) setSearch("");
    setOpen(v);
  };

  const triggerNode = (
    <>
      {renderTrigger ? (
        renderTrigger(selected)
      ) : (
        <span className={`truncate ${selected || selectedLabel ? "" : "text-muted-foreground"}`}>
          {selectedLabel ?? placeholder}
        </span>
      )}
      <span className="absolute inset-y-0 right-2 flex items-center gap-1">
        {clearable && selected && (
          <span
            role="button"
            tabIndex={0}
            aria-label="선택 해제"
            className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-secondary opacity-60 hover:opacity-100"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClear?.(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClear?.();
              }
            }}
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronsUpDown className="h-4 w-4 opacity-50" />
      </span>
    </>
  );

  // ===== Mobile (Drawer) =====
  if (isMobile) {
    return (
      <div className="relative h-9">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerNode}
        </button>

        <Drawer open={open} onOpenChange={(v) => { if (!v) setSearch(""); setOpen(v); }}>
          <DrawerContent className="flex h-[85dvh] max-h-[85dvh] flex-col data-[vaul-drawer-direction=bottom]:max-h-[85dvh]">
            <DrawerHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border pt-4 pb-3">
              <DrawerTitle>{mobileTitle ?? placeholder}</DrawerTitle>
              <DrawerDescription className="sr-only">{searchPlaceholder}</DrawerDescription>
              <DrawerClose
                aria-label="닫기"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </DrawerClose>
            </DrawerHeader>

            <div className="shrink-0 px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === "Enter" && trimmed && filtered.length === 0 && onCreateNew) {
                      e.preventDefault();
                      triggerCreate(trimmed);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="h-11 w-full rounded-lg border border-input bg-transparent pl-9 pr-10 text-base outline-none focus:ring-2 focus:ring-ring/30"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => {
                      setSearch("");
                      mobileInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
              {filtered.length === 0 ? (
                trimmed && onCreateNew ? (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm text-primary hover:bg-accent"
                    onClick={() => triggerCreate(trimmed)}
                  >
                    <span className="flex-1 truncate">&quot;{trimmed}&quot; 등록</span>
                    <CornerDownLeft className="size-4 opacity-60" />
                  </button>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</div>
                )
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((item) => {
                    const id = getItemId(item);
                    const isSelected = id === value;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(item)}
                          className={cn(
                            "flex min-h-12 w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-muted",
                            isSelected && "bg-muted/60"
                          )}
                          data-checked={isSelected ? "true" : undefined}
                        >
                          {renderItem(item, isSelected)}
                        </button>
                      </li>
                    );
                  })}
                  {trimmed && onCreateNew && (
                    <li>
                      <button
                        type="button"
                        onClick={() => triggerCreate(trimmed)}
                        className="mt-1 flex w-full items-center gap-2 rounded-md px-4 py-3 text-left text-sm text-primary hover:bg-accent"
                      >
                        <span className="flex-1 truncate">&quot;{trimmed}&quot; 등록</span>
                        <CornerDownLeft className="size-4 opacity-60" />
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // ===== Desktop (Popover + Command) =====
  return (
    <div className="relative h-9">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          disabled={disabled}
          className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triggerNode}
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && trimmed && filtered.length === 0 && onCreateNew) {
                  e.preventDefault();
                  triggerCreate(trimmed);
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {trimmed && onCreateNew ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                    onClick={() => triggerCreate(trimmed)}
                  >
                    <span className="flex-1 text-left truncate">&quot;{trimmed}&quot; 등록</span>
                    <kbd className="inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">
                      <CornerDownLeft className="size-3" />
                    </kbd>
                  </button>
                ) : emptyLabel}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((item) => {
                  const id = getItemId(item);
                  const isSelected = id === value;
                  return (
                    <CommandItem
                      key={id}
                      value={id}
                      onSelect={() => handleSelect(item)}
                      data-checked={isSelected ? "true" : undefined}
                    >
                      {renderItem(item, isSelected)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {trimmed && onCreateNew && filtered.length > 0 && (
                <CommandGroup>
                  <CommandItem onSelect={() => triggerCreate(trimmed)} className="text-primary">
                    <span className="flex-1 truncate">&quot;{trimmed}&quot; 등록</span>
                    <kbd className="inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">
                      <CornerDownLeft className="size-3" />
                    </kbd>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
