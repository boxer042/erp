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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Plus, Truck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatComma, parseComma } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileInlineCellProductSearch } from "@/components/inline-cell-product-search-mobile";
import type { SupplierProduct } from "./_types";

// ─── 품목별 배송비 입력 popover ───
// 입고 작성 폼/후기입 다이얼로그에서 행 단위 배송비 override 입력에 사용.
// value=빈문자열 → 분배 적용, 값 입력 → 그 품목 한정 운임 (분배 무시)
export function ItemShippingPopover({
  value,
  isTaxable,
  onChange,
  onTaxableChange,
  disabled,
}: {
  value: string;
  isTaxable: boolean;
  onChange: (v: string) => void;
  onTaxableChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [draftTaxable, setDraftTaxable] = useState(isTaxable);
  const has = value.trim() !== "" && value.trim() !== "0";

  const handleOpen = (next: boolean) => {
    if (next) {
      setDraft(value);
      setDraftTaxable(isTaxable);
    }
    setOpen(next);
  };

  const apply = () => {
    onChange(draft.trim());
    onTaxableChange(draftTaxable);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    onTaxableChange(true);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={`p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          has
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"
        }`}
        title={has ? `이 품목 운임: ₩${formatComma(value)}` : "이 품목만 다른 운임 입력"}
      >
        <Truck className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
          <div className="text-sm font-medium">이 품목만 다른 배송비</div>
          <div className="text-xs text-muted-foreground">
            입력하면 전표 운임 분배에서 빠지고 이 값(VAT포함 합계)이 적용됩니다.
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">운임 (₩, VAT포함)</label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatComma(draft)}
              onChange={(e) => setDraft(parseComma(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="비우면 분배 적용"
              className="h-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={draftTaxable}
              onCheckedChange={(c) => setDraftTaxable(c === true)}
            />
            <span>과세</span>
          </label>
          <div className="flex justify-between gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={clear}>
              비우기
            </Button>
            <Button type="button" size="sm" className="text-xs h-7" onClick={apply}>
              적용
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

// ─── 테이블 셀 내 품명 검색 ───
export function InlineCellProductSearch({
  rowIndex,
  products,
  onSelect,
  onCreateNewInline,
  existingIds,
  selectedName = "",
  isNew = false,
  pendingSourceRow,
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
  pendingSourceRow?: number;
  pendingNewProducts?: Array<{ name: string; spec: string; supplierCode: string; rowIndex: number }>;
  onSelectPending?: (p: { name: string; spec: string; supplierCode: string; rowIndex: number }) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (isMobile) {
    return (
      <MobileInlineCellProductSearch
        rowIndex={rowIndex}
        products={products}
        onSelect={onSelect}
        onCreateNew={onCreateNewInline}
        existingIds={existingIds}
        selectedName={selectedName}
        isNew={isNew}
        pendingSourceRow={pendingSourceRow}
        pendingNewProducts={pendingNewProducts}
        onSelectPending={onSelectPending}
      />
    );
  }

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
              {isNew && pendingSourceRow !== undefined && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed shrink-0">
                  행 {pendingSourceRow + 1} 재사용
                </Badge>
              )}
              {isNew && pendingSourceRow === undefined && (
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40 shrink-0">신규</Badge>
              )}
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
