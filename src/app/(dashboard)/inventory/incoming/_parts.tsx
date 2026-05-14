"use client";

import { useState } from "react";
import { format, parse } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  CalendarIcon,
  CornerDownLeft,
  Loader2,
  Plus,
  Truck,
} from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCalendar,
  JmCheckbox,
  JmInput,
  JmTooltip,
} from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { formatComma, parseComma } from "@/lib/utils";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import { MobileInlineCellProductSearch } from "@/components/inline-cell-product-search-mobile";
import type { SupplierProduct } from "./_types";

// ─── 품목별 배송비 입력 popover ─────────────────────────────────────────────
// 입고 작성 폼에서 행 단위 배송비 override 입력에 사용.
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
            ? "text-[var(--jm-action)] hover:bg-[var(--jm-surface-muted)]"
            : "text-[var(--jm-text-subtle)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
        }`}
        title={
          has
            ? `이 품목 운임: ₩${formatComma(value)}`
            : "이 품목만 다른 운임 입력"
        }
      >
        <Truck className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        data-jm-scope
        className="w-72 p-3 bg-[var(--jm-surface)] border-[var(--jm-border)] text-[var(--jm-text)]"
        align="end"
      >
        <div className="space-y-3">
          <div className="text-jm-sm font-medium text-[var(--jm-text)]">
            이 품목만 다른 배송비
          </div>
          <div className="text-jm-xs text-[var(--jm-text-muted)]">
            입력하면 전표 운임 분배에서 빠지고 이 값(VAT포함 합계)이 적용됩니다.
          </div>
          <div className="space-y-1.5">
            <label className="text-jm-xs text-[var(--jm-text-muted)]">
              운임 (₩, VAT포함)
            </label>
            <JmInput
              type="text"
              inputMode="numeric"
              value={formatComma(draft)}
              onChange={(e) => setDraft(parseComma(e.target.value))}
              onFocus={focusCaretEnd}
              placeholder="비우면 분배 적용"
            />
          </div>
          <label className="flex items-center gap-2 text-jm-sm cursor-pointer select-none text-[var(--jm-text)]">
            <JmCheckbox
              checked={draftTaxable}
              onCheckedChange={(c) => setDraftTaxable(c === true)}
            />
            <span>과세</span>
          </label>
          <div className="flex justify-between gap-2 pt-1">
            <JmButton variant="ghost" size="sm" onClick={clear}>
              비우기
            </JmButton>
            <JmButton variant="cta" size="sm" onClick={apply}>
              적용
            </JmButton>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── 날짜 입력 (캘린더 + 직접 입력 YYYYMMDD) ────────────────────────────────
export function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);

  const display = value
    ? format(parse(value, "yyyy-MM-dd", new Date()), "yyyy년 M월 d일", {
        locale: ko,
      })
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
        <span className="text-jm-xs text-[var(--jm-text-muted)] w-12 shrink-0">
          {label}
        </span>
      ) : null}
      <div className="flex-1 flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => tryParse(text)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing)
                tryParse(text);
            }}
            placeholder="20260329"
            className="h-9 flex-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setText("");
              setEditing(true);
            }}
            className="h-9 flex-1 text-left rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:border-[var(--jm-border-strong)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]"
          >
            {display || (
              <span className="text-[var(--jm-text-subtle)]">날짜 입력...</span>
            )}
          </button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] hover:bg-[var(--jm-surface-muted)] shrink-0">
            <CalendarIcon className="size-3.5 text-[var(--jm-text-muted)]" />
          </PopoverTrigger>
          <PopoverContent data-jm-scope className="w-auto p-0 border-0" align="end">
            <JmCalendar
              value={value ? parse(value, "yyyy-MM-dd", new Date()) : undefined}
              onChange={(date) => {
                if (date) {
                  onChange(format(date, "yyyy-MM-dd"));
                  setOpen(false);
                  setEditing(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ─── 테이블 셀 내 품명 검색 ────────────────────────────────────────────────
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
  loading = false,
}: {
  rowIndex: number;
  products: SupplierProduct[];
  onSelect: (product: SupplierProduct) => void;
  onCreateNewInline: (name: string) => void;
  existingIds: string[];
  selectedName?: string;
  isNew?: boolean;
  pendingSourceRow?: number;
  pendingNewProducts?: Array<{
    name: string;
    spec: string;
    supplierCode: string;
    rowIndex: number;
  }>;
  onSelectPending?: (p: {
    name: string;
    spec: string;
    supplierCode: string;
    rowIndex: number;
  }) => void;
  loading?: boolean;
}) {
  const isMobile = useIsCompactDevice();
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
        loading={loading}
      />
    );
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.supplierCode?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="relative h-7">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v && selectedName) setSearch(selectedName);
          if (!v) setSearch("");
        }}
      >
        <PopoverTrigger
          data-product-trigger={rowIndex}
          className={`relative flex h-7 max-h-7 box-border w-full items-center overflow-hidden rounded bg-transparent px-2 text-jm-sm cursor-pointer hover:bg-[var(--jm-surface-muted)] focus:outline-none focus-visible:outline-none ${selectedName ? "text-[var(--jm-text)]" : "text-[var(--jm-text-subtle)]"}`}
        >
          {selectedName ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="font-medium truncate">{selectedName}</span>
              {isNew && pendingSourceRow !== undefined && (
                <JmBadge
                  variant="default"
                  size="sm"
                  shape="square"
                  className="shrink-0"
                >
                  행 {pendingSourceRow + 1} 재사용
                </JmBadge>
              )}
              {isNew && pendingSourceRow === undefined && (
                <JmBadge
                  variant="info"
                  size="sm"
                  shape="square"
                  className="shrink-0"
                >
                  신규
                </JmBadge>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Plus className="size-3.5 shrink-0" />
              품명 검색…
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          data-jm-scope
          className="w-[var(--anchor-width)] p-0 bg-[var(--jm-surface)] border-[var(--jm-border)]"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="품명 또는 품번..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  search.trim() &&
                  filtered.length === 0
                ) {
                  e.preventDefault();
                  onCreateNewInline(search.trim());
                  setOpen(false);
                  setSearch("");
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-jm-xs text-[var(--jm-text-muted)]">
                    <Loader2 className="size-4 animate-spin" />
                    공급상품 불러오는 중…
                  </div>
                ) : search.trim() ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-jm-sm text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] rounded cursor-pointer"
                    onClick={() => {
                      onCreateNewInline(search.trim());
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Plus className="size-4" />
                    &quot;{search.trim()}&quot; 직접 입력
                    <kbd className="ml-auto inline-flex h-5 items-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-1.5 text-[10px] text-[var(--jm-text-muted)] font-mono">
                      <CornerDownLeft className="size-3" />
                    </kbd>
                  </button>
                ) : (
                  "결과 없음"
                )}
              </CommandEmpty>
              {pendingNewProducts &&
                pendingNewProducts.filter(
                  (p) =>
                    p.rowIndex !== rowIndex &&
                    p.name.toLowerCase().includes(search.toLowerCase()),
                ).length > 0 && (
                  <CommandGroup heading="이미 입력된 신규 항목">
                    {pendingNewProducts
                      .filter(
                        (p) =>
                          p.rowIndex !== rowIndex &&
                          p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <CommandItem
                          key={`pending-${p.rowIndex}`}
                          value={`pending-${p.rowIndex}`}
                          onSelect={() => {
                            onSelectPending?.(p);
                            setOpen(false);
                            setSearch("");
                          }}
                        >
                          <span className="flex-1">{p.name}</span>
                          {p.spec && (
                            <span className="text-jm-xs text-[var(--jm-text-muted)] ml-1">
                              ({p.spec})
                            </span>
                          )}
                          <JmBadge
                            variant="info"
                            size="sm"
                            shape="square"
                            className="ml-2"
                          >
                            행 {p.rowIndex + 1} 재사용
                          </JmBadge>
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
                      <span className="flex-1 flex items-center gap-1.5">
                        {p.name}
                        {p.hasMapping === false && (
                          <JmTooltip content="매핑 없음 — 등록 시 오르판 로트로 들어감">
                            <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)] shrink-0" />
                          </JmTooltip>
                        )}
                      </span>
                      {p.supplierCode && (
                        <span className="text-jm-xs text-[var(--jm-text-muted)] mr-2">
                          {p.supplierCode}
                        </span>
                      )}
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">
                        ₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}
                      </span>
                      {alreadyAdded && (
                        <JmBadge
                          variant="warning"
                          size="sm"
                          shape="square"
                          className="ml-2"
                        >
                          추가됨
                        </JmBadge>
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
                  >
                    <Plus className="size-4" />
                    &quot;{search.trim()}&quot; 직접 입력
                    <kbd className="ml-auto inline-flex h-5 items-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-1.5 text-[10px] text-[var(--jm-text-muted)] font-mono">
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
