"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, CornerDownLeft, X } from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierComboboxProps {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
}

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  onCreateNew,
  placeholder = "거래처 선택...",
  clearable = false,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = suppliers.find((s) => s.id === value);

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.businessNumber?.toLowerCase().includes(q) ?? false)
    );
  });

  const hasExactMatch = suppliers.some(
    (s) => s.name.toLowerCase() === search.toLowerCase()
  );

  const triggerCreate = (name: string) => {
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNew(name), 0);
  };

  return (
    <div className="relative h-9">
    <Popover open={open} onOpenChange={(v) => { if (v) setSearch(""); setOpen(v); }}>
      <PopoverTrigger className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none">
        <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="absolute inset-y-0 right-2 flex items-center gap-1">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={0}
              aria-label="선택 해제"
              className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-secondary opacity-60 hover:opacity-100"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange("", ""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("", "");
                }
              }}
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="거래처 검색..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && search.trim() && filtered.length === 0) {
                e.preventDefault();
                triggerCreate(search.trim());
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                  onClick={() => triggerCreate(search.trim())}
                >
                  <span className="flex-1 text-left truncate">&quot;{search.trim()}&quot; 등록</span>
                  <kbd className="inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">
                    <CornerDownLeft className="size-3" />
                  </kbd>
                </button>
              ) : "결과 없음"}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => { onChange(s.id, s.name); setOpen(false); setSearch(""); }}
                  data-checked={s.id === value ? "true" : undefined}
                >
                  <span>{s.name}</span>
                  {s.businessNumber && (
                    <span className="ml-auto text-xs text-muted-foreground">{s.businessNumber}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && !hasExactMatch && filtered.length > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => triggerCreate(search.trim())}
                  className="text-primary"
                >
                  <span className="flex-1 truncate">&quot;{search.trim()}&quot; 등록</span>
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
