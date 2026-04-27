"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, X } from "lucide-react";

export interface AssemblyPresetOption {
  id: string;
  name: string;
  description?: string | null;
}

interface AssemblyPresetComboboxProps {
  presets: AssemblyPresetOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function AssemblyPresetCombobox({
  presets,
  value,
  onChange,
  placeholder = "프리셋 선택 (선택)",
  clearable = true,
  disabled = false,
}: AssemblyPresetComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = presets.find((p) => p.id === value);

  const filtered = presets.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) setSearch(""); setOpen(v); }}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
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
            placeholder="프리셋 검색..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {filtered.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => { onChange(p.id, p.name); setOpen(false); setSearch(""); }}
                  data-checked={p.id === value ? "true" : undefined}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.description && (
                    <span className="ml-2 text-xs text-muted-foreground truncate max-w-[40%]">
                      {p.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
