"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, CornerDownLeft } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}

interface CustomerComboboxProps {
  customers: Customer[];
  value: string;
  onChange: (id: string, customer: Customer) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
}

export function CustomerCombobox({
  customers,
  value,
  onChange,
  onCreateNew,
  placeholder = "고객 선택...",
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = customers.find((c) => c.id === value);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone?.toLowerCase().includes(q) ?? false) ||
      (c.businessNumber?.toLowerCase().includes(q) ?? false)
    );
  });

  const hasExactMatch = customers.some(
    (c) => c.name.toLowerCase() === search.toLowerCase()
  );

  const triggerCreate = (name: string) => {
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNew(name), 0);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) setSearch(""); setOpen(v); }}>
      <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="고객 검색..."
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
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => { onChange(c.id, c); setOpen(false); setSearch(""); }}
                  data-checked={c.id === value ? "true" : undefined}
                >
                  <span>{c.name}</span>
                  {c.phone && (
                    <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
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
  );
}
