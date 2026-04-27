"use client";

import { useState } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  unitCost: string | null;
  unitOfMeasure: string;
  isSet: boolean;
  isCanonical?: boolean;
  canonicalProductId?: string | null;
  taxType?: string;
}

interface ProductComboboxProps {
  products: ProductOption[];
  value: string;
  onChange: (product: ProductOption) => void;
  /** "set" — isSet=true인 상품만 표시 (부속의 상위 상품 연결용)
   *  "component" — isSet=false인 상품만 표시 (세트/조립 구성품 선택용, 기본값)
   *  undefined — 모두 표시 */
  filterType?: "set" | "component";
  placeholder?: string;
  disabled?: boolean;
}

export function ProductCombobox({
  products,
  value,
  onChange,
  filterType,
  placeholder = "상품 선택...",
  disabled = false,
}: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = products
    .filter((p) => {
      if (filterType === "set") return p.isSet;
      if (filterType === "component") return !p.isSet;
      return true;
    })
    .filter((p) => {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    });

  const selected = products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) setSearch(""); setOpen(v); }}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm cursor-pointer hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? `${selected.name} (${selected.sku})` : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="상품명 또는 SKU 검색..."
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
                  onSelect={() => { onChange(p); setOpen(false); setSearch(""); }}
                  data-checked={p.id === value ? "true" : undefined}
                >
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground shrink-0">{p.sku}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
