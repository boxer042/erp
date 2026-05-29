"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Plus, Search, X } from "lucide-react";

import { cn, normalizeSearch } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  JmBadge,
  JmDrawer,
  JmDrawerClose,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
} from "@/jm";

export interface SupplierProductLike {
  id: string;
  name: string;
  supplierCode?: string | null;
  unitPrice: string;
  spec?: string | null;
  /** 매핑 없음 — 등록 시 오르판 로트로 들어감 (incoming/initial 만 사용; returns 는 무관) */
  hasMapping?: boolean | null;
}

export interface PendingNewProduct {
  name: string;
  spec: string;
  supplierCode: string;
  rowIndex: number;
}

interface Props<T extends SupplierProductLike> {
  rowIndex: number;
  products: T[];
  onSelect: (p: T) => void;
  onCreateNew: (name: string) => void;
  existingIds?: string[];
  selectedName?: string;
  isNew?: boolean;
  pendingSourceRow?: number;
  pendingNewProducts?: PendingNewProduct[];
  onSelectPending?: (p: PendingNewProduct) => void;
  disableAlreadyAdded?: boolean;
  /** 공급상품 fetch 중 — 거래처 변경 직후 표시 */
  loading?: boolean;
}

export function MobileInlineCellProductSearch<T extends SupplierProductLike>({
  rowIndex,
  products,
  onSelect,
  onCreateNew,
  existingIds = [],
  selectedName = "",
  isNew = false,
  pendingSourceRow,
  pendingNewProducts,
  onSelectPending,
  disableAlreadyAdded = false,
  loading = false,
}: Props<T>) {
  const isPhoneSize = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSearch(selectedName);
    const t = setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }, 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = search.trim();
  const nq = normalizeSearch(search);
  const filtered = products.filter((p) => {
    if (!trimmed) return true;
    return (
      normalizeSearch(p.name).includes(nq) ||
      (p.supplierCode ? normalizeSearch(p.supplierCode).includes(nq) : false) ||
      (p.spec ? normalizeSearch(p.spec).includes(nq) : false)
    );
  });
  const hasExactMatch = products.some((p) => normalizeSearch(p.name) === nq);

  const matchingPending = pendingNewProducts
    ? pendingNewProducts.filter(
        (p) => p.rowIndex !== rowIndex && normalizeSearch(p.name).includes(nq),
      )
    : [];

  const triggerCreate = () => {
    if (!trimmed) return;
    setOpen(false);
    setSearch("");
    setTimeout(() => onCreateNew(trimmed), 0);
  };

  const handleSelect = (p: T) => {
    onSelect(p);
    setOpen(false);
    setSearch("");
  };

  const handleSelectPending = (p: PendingNewProduct) => {
    onSelectPending?.(p);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <button
        type="button"
        data-product-trigger={rowIndex}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-7 w-full items-center rounded bg-transparent px-2 text-jm-sm cursor-pointer hover:bg-[var(--jm-surface-muted)]",
          selectedName ? "text-[var(--jm-text)]" : "text-[var(--jm-info-fg)]",
        )}
      >
        {selectedName ? (
          <span className="flex items-center gap-1.5 truncate">
            <span className="font-medium truncate">{selectedName}</span>
            {isNew && pendingSourceRow !== undefined && (
              <JmBadge
                variant="default"
                size="sm"
                shape="square"
                className="text-jm-2xs text-[var(--jm-text-muted)] shrink-0"
              >
                행 {pendingSourceRow + 1} 재사용
              </JmBadge>
            )}
            {isNew && pendingSourceRow === undefined && (
              <JmBadge
                variant="info"
                size="sm"
                shape="square"
                className="text-jm-2xs shrink-0"
              >
                신규
              </JmBadge>
            )}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Plus className="size-3.5 shrink-0" />
            품명 검색...
          </span>
        )}
      </button>

      <JmDrawer
        open={open}
        onOpenChange={(v) => {
          if (!v) setSearch("");
          setOpen(v);
        }}
      >
        <JmDrawerContent
          side="bottom"
          className={cn(
            "flex flex-col",
            isPhoneSize
              ? "h-[85dvh] max-h-[85dvh]"
              : "h-[85vh] max-h-[85vh]",
          )}
        >
          <JmDrawerHeader className="flex shrink-0 flex-row items-center justify-between border-b border-[var(--jm-border)] pt-4 pb-3">
            <JmDrawerTitle>품명 검색</JmDrawerTitle>
            <JmDrawerDescription className="sr-only">
              품명 또는 품번으로 검색
            </JmDrawerDescription>
            <JmDrawerClose
              aria-label="닫기"
              className="inline-flex size-8 items-center justify-center rounded-md text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] transition-colors"
            >
              <X className="size-4" />
            </JmDrawerClose>
          </JmDrawerHeader>

          <div className="shrink-0 px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--jm-text-muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && trimmed && filtered.length === 0) {
                    e.preventDefault();
                    triggerCreate();
                  }
                }}
                placeholder="품명 또는 품번..."
                className="h-11 w-full rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] pl-9 pr-10 text-jm-base text-[var(--jm-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] placeholder:text-[var(--jm-text-subtle)]"
              />
              {search && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => {
                    setSearch("");
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-jm-sm text-[var(--jm-text-muted)]">
                <Loader2 className="size-4 animate-spin" />
                공급상품 불러오는 중…
              </div>
            ) : filtered.length === 0 && matchingPending.length === 0 ? (
              trimmed ? (
                <button
                  type="button"
                  onClick={triggerCreate}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-jm-sm text-[var(--jm-info-fg)] hover:bg-[var(--jm-surface-muted)]"
                >
                  <Plus className="size-4" />
                  <span className="flex-1 truncate">&quot;{trimmed}&quot; 직접 입력</span>
                  <CornerDownLeft className="size-4 opacity-60" />
                </button>
              ) : (
                <div className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  결과 없음
                </div>
              )
            ) : (
              <ul className="flex flex-col">
                {matchingPending.length > 0 && (
                  <>
                    <li className="px-3 pt-2 pb-1 text-jm-xs font-medium text-[var(--jm-text-muted)]">
                      이미 입력된 신규 항목
                    </li>
                    {matchingPending.map((p) => (
                      <li key={`pending-${p.rowIndex}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectPending(p)}
                          className="flex min-h-12 w-full items-center gap-2 rounded-md px-4 py-2 text-left text-jm-sm text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{p.name}</span>
                            {p.spec && (
                              <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                                {p.spec}
                              </span>
                            )}
                          </span>
                          <JmBadge
                            variant="info"
                            size="sm"
                            shape="square"
                            className="ml-2 text-jm-xs shrink-0"
                          >
                            행 {p.rowIndex + 1} 재사용
                          </JmBadge>
                        </button>
                      </li>
                    ))}
                  </>
                )}

                {filtered.length > 0 && matchingPending.length > 0 && (
                  <li className="my-1 border-t border-[var(--jm-border)]" />
                )}

                {filtered.map((p) => {
                  const alreadyAdded = existingIds.includes(p.id);
                  const disabled = disableAlreadyAdded && alreadyAdded;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) handleSelect(p);
                        }}
                        className={cn(
                          "flex min-h-12 w-full items-center gap-2 rounded-md px-4 py-2 text-left text-jm-sm text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]",
                          disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{p.name}</span>
                          {p.spec && (
                            <span className="truncate text-jm-xs text-[var(--jm-text-muted)]">
                              {p.spec}
                            </span>
                          )}
                        </span>
                        {p.supplierCode && (
                          <span className="text-jm-xs text-[var(--jm-text-muted)] mr-2 shrink-0">
                            {p.supplierCode}
                          </span>
                        )}
                        <span className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums shrink-0">
                          ₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}
                        </span>
                        {alreadyAdded && (
                          <JmBadge
                            variant={disableAlreadyAdded ? "default" : "warning"}
                            size="sm"
                            shape="square"
                            className="ml-2 text-jm-xs"
                          >
                            추가됨
                          </JmBadge>
                        )}
                      </button>
                    </li>
                  );
                })}

                {trimmed && !hasExactMatch && filtered.length > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={triggerCreate}
                      className="mt-1 flex w-full items-center gap-2 rounded-md px-4 py-3 text-left text-jm-sm text-[var(--jm-info-fg)] hover:bg-[var(--jm-surface-muted)]"
                    >
                      <Plus className="size-4" />
                      <span className="flex-1 truncate">&quot;{trimmed}&quot; 직접 입력</span>
                      <CornerDownLeft className="size-4 opacity-60" />
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </JmDrawerContent>
      </JmDrawer>
    </>
  );
}
