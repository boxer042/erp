"use client";

import { useEffect, useRef, useState } from "react";
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
import { Plus, CornerDownLeft, Loader2 } from "lucide-react";
import {
  JmBadge,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import { MobileInlineCellProductSearch } from "@/components/inline-cell-product-search-mobile";
import type {
  InitialHistoryItem,
  PendingNewProduct,
  SupplierProduct,
} from "./_types";
import { formatPrice } from "./_helpers";

// ─── 인라인 품명 검색 ──────────────────────────────────────────────────────

interface InlineCellProductSearchProps {
  rowIndex: number;
  products: SupplierProduct[];
  onSelect: (product: SupplierProduct) => void;
  onCreateNewInline: (name: string) => void;
  onSelectPending: (item: PendingNewProduct) => void;
  existingIds: string[];
  pendingNewProducts?: PendingNewProduct[];
  selectedName?: string;
  isNew?: boolean;
  pendingSourceRow?: number;
  /** 공급상품 fetch 중 — 거래처 변경 직후 표시 */
  loading?: boolean;
}

export function InlineCellProductSearch({
  rowIndex,
  products,
  onSelect,
  onCreateNewInline,
  onSelectPending,
  existingIds,
  pendingNewProducts,
  selectedName = "",
  isNew = false,
  pendingSourceRow,
  loading = false,
}: InlineCellProductSearchProps) {
  const isMobile = useIsCompactDevice();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

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

  const triggerCreate = () => {
    const val = searchRef.current.trim();
    if (!val) return;
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNewInline(val), 0);
  };

  return (
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
        className={`flex h-7 w-full items-center rounded bg-transparent px-2 text-jm-sm cursor-pointer hover:bg-[var(--jm-surface-muted)] ${selectedName ? "text-[var(--jm-text)]" : "text-[var(--jm-text-subtle)]"}`}
      >
        {selectedName ? (
          <span className="flex items-center gap-1.5 truncate">
            <span className="font-medium truncate">{selectedName}</span>
            {isNew && pendingSourceRow !== undefined && (
              <JmBadge variant="default" size="sm" shape="square" className="shrink-0">
                행 {pendingSourceRow + 1} 재사용
              </JmBadge>
            )}
            {isNew && pendingSourceRow === undefined && (
              <JmBadge variant="info" size="sm" shape="square" className="shrink-0">
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
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="품명 또는 품번..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && search.trim() && filtered.length === 0) {
                e.preventDefault();
                triggerCreate();
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
                  onClick={triggerCreate}
                >
                  <span className="flex-1 text-left truncate">
                    &quot;{search.trim()}&quot;
                  </span>
                  <kbd className="inline-flex h-5 items-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-1.5 text-[10px] text-[var(--jm-text-muted)] font-mono">
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
                          onSelectPending(p);
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
                        <JmBadge variant="info" size="sm" shape="square" className="ml-2">
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
                        <span
                          className="size-1.5 rounded-full bg-[var(--jm-warning-solid)] shrink-0"
                          title="매핑 없음 — 등록 시 오르판 로트로 들어감"
                        />
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
                      <JmBadge variant="warning" size="sm" shape="square" className="ml-2">
                        추가됨
                      </JmBadge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {search.trim() &&
              filtered.length > 0 &&
              !filtered.some(
                (p) => p.name.toLowerCase() === search.toLowerCase(),
              ) && (
                <CommandGroup>
                  <CommandItem onSelect={triggerCreate}>
                    <span className="flex-1 truncate">
                      &quot;{search.trim()}&quot;
                    </span>
                    <kbd className="inline-flex h-5 items-center rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-1.5 text-[10px] text-[var(--jm-text-muted)] font-mono">
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

// ─── 합계 푸터 ──────────────────────────────────────────────────────────────

function SummaryCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 min-w-[140px] items-center justify-between gap-3 border-r border-[var(--jm-border)] px-3 py-2.5 last:border-r-0">
      <span className="text-jm-xs text-[var(--jm-text-muted)]">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

interface SummaryFooterProps {
  validCount: number;
  totalSupply: number;
  totalTax: number;
  totalDiscount: number;
  totalAmount: number;
}

export function SummaryFooter({
  validCount,
  totalSupply,
  totalTax,
  totalDiscount,
  totalAmount,
}: SummaryFooterProps) {
  return (
    <div className="border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
      <div className="flex flex-wrap text-jm-sm">
        <SummaryCell label="품목수">{validCount}건</SummaryCell>
        <SummaryCell label="공급가액">
          ₩{formatPrice(Math.round(totalSupply))}
        </SummaryCell>
        <SummaryCell label="세액">
          {totalTax > 0 ? `₩${formatPrice(totalTax)}` : ""}
        </SummaryCell>
        <SummaryCell label="할인합계">
          <span className={totalDiscount > 0 ? "text-[var(--jm-danger-fg)]" : ""}>
            {totalDiscount > 0
              ? `-₩${formatPrice(Math.round(totalDiscount))}`
              : ""}
          </span>
        </SummaryCell>
        <SummaryCell label="합계금액">
          <span className="font-bold text-jm-base">
            ₩{formatPrice(totalAmount)}
          </span>
        </SummaryCell>
      </div>
    </div>
  );
}

// ─── 이력 탭 스켈레톤 ──────────────────────────────────────────────────────

export function InitialHistorySkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-28" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

// ─── 이력 테이블 ──────────────────────────────────────────────────────────

interface HistoryTableProps {
  items: InitialHistoryItem[];
  loading: boolean;
}

export function HistoryTable({ items, loading }: HistoryTableProps) {
  return (
    <JmTable>
      <JmTableHeader>
        <JmTableRow>
          <JmTableHead>거래처</JmTableHead>
          <JmTableHead>품명</JmTableHead>
          <JmTableHead>규격</JmTableHead>
          <JmTableHead>품번</JmTableHead>
          <JmTableHead>단위</JmTableHead>
          <JmTableHead className="text-right">단가</JmTableHead>
          <JmTableHead>등록일</JmTableHead>
        </JmTableRow>
      </JmTableHeader>
      <JmTableBody>
        {loading ? (
          <InitialHistorySkeletonRows />
        ) : items.length === 0 ? (
          <JmTableRow>
            <JmTableCell
              colSpan={7}
              className="text-center py-8 text-[var(--jm-text-muted)]"
            >
              초기 등록 이력이 없습니다
            </JmTableCell>
          </JmTableRow>
        ) : (
          items.map((item) => (
            <JmTableRow key={item.id}>
              <JmTableCell>{item.supplier.name}</JmTableCell>
              <JmTableCell className="font-medium">{item.name}</JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {item.spec || "—"}
              </JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {item.supplierCode || "—"}
              </JmTableCell>
              <JmTableCell>{item.unitOfMeasure}</JmTableCell>
              <JmTableCell className="text-right tabular-nums">
                ₩{parseFloat(item.unitPrice).toLocaleString("ko-KR")}
              </JmTableCell>
              <JmTableCell className="text-[var(--jm-text-muted)]">
                {new Date(item.createdAt).toLocaleDateString("ko-KR")}
              </JmTableCell>
            </JmTableRow>
          ))
        )}
      </JmTableBody>
    </JmTable>
  );
}
