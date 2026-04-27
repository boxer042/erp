"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, X } from "lucide-react";

export interface AssemblyTemplateOption {
  id: string;
  name: string;
  description?: string | null;
}

interface AssemblyTemplateComboboxProps {
  templates: AssemblyTemplateOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function AssemblyTemplateCombobox({
  templates,
  value,
  onChange,
  placeholder = "템플릿 선택...",
  clearable = true,
  disabled = false,
}: AssemblyTemplateComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = templates.find((t) => t.id === value);

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false)
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
            placeholder="템플릿 검색..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>결과 없음</CommandEmpty>
            <CommandGroup>
              {filtered.map((t) => (
                <CommandItem
                  key={t.id}
                  value={t.id}
                  onSelect={() => { onChange(t.id, t.name); setOpen(false); setSearch(""); }}
                  data-checked={t.id === value ? "true" : undefined}
                >
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.description && (
                    <span className="ml-2 text-xs text-muted-foreground truncate max-w-[40%]">
                      {t.description}
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
