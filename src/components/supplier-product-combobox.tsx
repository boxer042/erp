"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, CornerDownLeft } from "lucide-react";

interface SupplierProductCostItem {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

interface SupplierProduct {
  id: string;
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  incomingCosts?: SupplierProductCostItem[];
}

interface SupplierProductComboboxProps {
  supplierProducts: SupplierProduct[];
  value: string;
  onChange: (sp: SupplierProduct) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SupplierProductCombobox({
  supplierProducts,
  value,
  onChange,
  onCreateNew,
  placeholder = "공급상품 선택...",
  disabled = false,
}: SupplierProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = supplierProducts.find((s) => s.id === value);

  const filtered = supplierProducts.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.supplierCode?.toLowerCase().includes(q) ?? false)
    );
  });

  const hasExactMatch = supplierProducts.some(
    (s) => s.name.toLowerCase() === search.toLowerCase()
  );

  const triggerCreate = (name: string) => {
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNew(name), 0);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) setSearch(""); setOpen(v); }}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected
            ? `${selected.name}${selected.spec ? ` (${selected.spec})` : ""}`
            : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="품명 또는 품번 검색..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && search.trim() && !hasExactMatch) {
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
                  onSelect={() => { onChange(s); setOpen(false); setSearch(""); }}
                  data-checked={s.id === value ? "true" : undefined}
                >
                  <span className="flex-1">{s.name}{s.spec ? ` (${s.spec})` : ""}</span>
                  {s.supplierCode && (
                    <span className="text-xs text-muted-foreground mr-2">{s.supplierCode}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    ₩{parseFloat(s.unitPrice).toLocaleString("ko-KR")}
                  </span>
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
