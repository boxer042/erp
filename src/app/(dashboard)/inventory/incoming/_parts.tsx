"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, ChevronsUpDown, Plus } from "lucide-react";
import type { Supplier, SupplierProduct } from "./_types";

// ─── 날짜 입력 (캘린더 + 직접 입력) ───
export function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  const display = value
    ? format(parse(value, "yyyy-MM-dd", new Date()), "yyyy년 M월 d일", { locale: ko })
    : "";

  const tryParse = (input: string) => {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 8) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      const date = new Date(`${y}-${m}-${d}`);
      if (!isNaN(date.getTime())) {
        onChange(`${y}-${m}-${d}`);
        setEditing(false);
        return;
      }
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {label ? (
        <span className="text-xs text-muted-foreground w-12 shrink-0">{label}</span>
      ) : null}
      <div className="flex-1 flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => tryParse(text)}
            onKeyDown={(e) => { if (e.key === "Enter") tryParse(text); }}
            placeholder="20260329"
            className="h-8 flex-1 rounded-md border border-border bg-transparent px-3 text-sm outline-none focus:border-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setText(""); setEditing(true); }}
            className="h-8 flex-1 text-left rounded-md border border-border bg-transparent px-3 text-sm hover:bg-muted"
          >
            {display || <span className="text-muted-foreground">날짜 입력...</span>}
          </button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="h-8 w-8 flex items-center justify-center rounded-md border border-border hover:bg-muted shrink-0">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={value ? parse(value, "yyyy-MM-dd", new Date()) : undefined}
              onSelect={(date) => {
                if (date) {
                  onChange(format(date, "yyyy-MM-dd"));
                  setOpen(false);
                  setEditing(false);
                }
              }}
              defaultMonth={value ? parse(value, "yyyy-MM-dd", new Date()) : new Date()}
              locale={ko}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ─── Combobox 컴포넌트 ───
export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  onCreateNew,
}: {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = suppliers.find((s) => s.id === value);

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.businessNumber?.toLowerCase().includes(q) ?? false);
  });

  const hasExactMatch = suppliers.some(
    (s) => s.name.toLowerCase() === search.toLowerCase()
  );

  return (
    <div className="relative h-9">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="relative flex h-9 max-h-9 box-border w-full items-center overflow-hidden rounded-lg border border-input bg-transparent pl-3 pr-9 text-sm cursor-pointer hover:bg-accent/50 focus:outline-none focus-visible:outline-none"
        >
          <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
            {selected ? selected.name : "거래처 선택..."}
          </span>
          <span className="absolute inset-y-0 right-2 flex items-center">
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="거래처 검색..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                  onClick={() => {
                    onCreateNew(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 새로 등록
                </button>
              ) : (
                "결과 없음"
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onChange(s.id, s.name);
                    setOpen(false);
                    setSearch("");
                  }}
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
                  onSelect={() => {
                    onCreateNew(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-primary"
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 새로 등록
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

// ─── 테이블 셀 내 품명 검색 ───
export function InlineCellProductSearch({
  rowIndex,
  products,
  onSelect,
  onCreateNewInline,
  existingIds,
  selectedName = "",
  isNew = false,
  pendingNewProducts,
  onSelectPending,
}: {
  rowIndex: number;
  products: SupplierProduct[];
  onSelect: (product: SupplierProduct) => void;
  onCreateNewInline: (name: string) => void;
  existingIds: string[];
  selectedName?: string;
  isNew?: boolean;
  pendingNewProducts?: Array<{ name: string; spec: string; supplierCode: string; rowIndex: number }>;
  onSelectPending?: (p: { name: string; spec: string; supplierCode: string; rowIndex: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.supplierCode?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="relative h-7">
      <Popover open={open} onOpenChange={(v) => {
        setOpen(v);
        if (v && selectedName) setSearch(selectedName);
        if (!v) setSearch("");
      }}>
        <PopoverTrigger
          data-product-trigger={rowIndex}
          className={`relative flex h-7 max-h-7 box-border w-full items-center overflow-hidden rounded bg-transparent px-2 text-sm cursor-pointer hover:bg-muted focus:outline-none focus-visible:outline-none ${selectedName ? "text-foreground" : "text-primary"}`}
        >
          {selectedName ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-medium truncate">{selectedName}</span>
              {isNew && <Badge variant="outline" className="text-[10px] text-primary border-[#3ECF8E]/40 shrink-0">신규</Badge>}
            </span>
          ) : (
            <span className="flex items-center gap-1.5"><Plus className="size-3.5 shrink-0" />품명 검색...</span>
          )}
        </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="품명 또는 품번..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && search.trim() && filtered.length === 0) {
                e.preventDefault();
                onCreateNewInline(search.trim());
                setOpen(false);
                setSearch("");
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded cursor-pointer"
                  onClick={() => {
                    onCreateNewInline(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 직접 입력
                  <kbd className="ml-auto inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">↵</kbd>
                </button>
              ) : (
                "결과 없음"
              )}
            </CommandEmpty>
            {pendingNewProducts && pendingNewProducts.filter(
              (p) => p.rowIndex !== rowIndex && p.name.toLowerCase().includes(search.toLowerCase())
            ).length > 0 && (
              <CommandGroup heading="이미 입력된 신규 항목">
                {pendingNewProducts
                  .filter((p) => p.rowIndex !== rowIndex && p.name.toLowerCase().includes(search.toLowerCase()))
                  .map((p) => (
                    <CommandItem
                      key={`pending-${p.rowIndex}`}
                      value={`pending-${p.rowIndex}`}
                      onSelect={() => { onSelectPending?.(p); setOpen(false); setSearch(""); }}
                    >
                      <span className="flex-1">{p.name}</span>
                      {p.spec && <span className="text-xs text-muted-foreground ml-1">({p.spec})</span>}
                      <Badge variant="outline" className="ml-2 text-xs text-primary border-primary/40">
                        행 {p.rowIndex + 1} 재사용
                      </Badge>
                    </CommandItem>
                  ))}
              </CommandGroup>
            )}
            <CommandGroup>
              {filtered.map((p) => {
                const alreadyAdded = existingIds.includes(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => {
                      onSelect(p);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <span className="flex-1">{p.name}</span>
                    {p.supplierCode && (
                      <span className="text-xs text-muted-foreground mr-2">{p.supplierCode}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      ₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}
                    </span>
                    {alreadyAdded && (
                      <Badge variant="outline" className="ml-2 text-xs text-yellow-500 border-yellow-500/40">추가됨</Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {search.trim() && filtered.length > 0 && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onCreateNewInline(search.trim());
                    setOpen(false);
                    setSearch("");
                  }}
                  className="text-primary"
                >
                  <Plus className="size-4" />
                  &quot;{search.trim()}&quot; 직접 입력
                  <kbd className="ml-auto inline-flex h-5 items-center rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground font-mono">↵</kbd>
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
