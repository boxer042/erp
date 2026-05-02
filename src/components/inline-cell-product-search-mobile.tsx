"use client";

import { useEffect, useRef, useState } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { CornerDownLeft, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export interface SupplierProductLike {
  id: string;
  name: string;
  supplierCode?: string | null;
  unitPrice: string;
  spec?: string | null;
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
  const lower = trimmed.toLowerCase();
  const filtered = products.filter((p) => {
    if (!trimmed) return true;
    return (
      p.name.toLowerCase().includes(lower) ||
      (p.supplierCode?.toLowerCase().includes(lower) ?? false)
    );
  });
  const hasExactMatch = products.some((p) => p.name.toLowerCase() === lower);

  const matchingPending = pendingNewProducts
    ? pendingNewProducts.filter(
        (p) => p.rowIndex !== rowIndex && p.name.toLowerCase().includes(lower),
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
          "flex h-7 w-full items-center rounded bg-transparent px-2 text-sm cursor-pointer hover:bg-muted",
          selectedName ? "text-foreground" : "text-primary",
        )}
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
          <span className="flex items-center gap-1.5">
            <Plus className="size-3.5 shrink-0" />품명 검색...
          </span>
        )}
      </button>

      <Drawer
        open={open}
        onOpenChange={(v) => { if (!v) setSearch(""); setOpen(v); }}
        repositionInputs={isPhoneSize}
      >
        <DrawerContent
          className={cn(
            "flex flex-col",
            isPhoneSize
              ? "h-[85dvh] max-h-[85dvh] data-[vaul-drawer-direction=bottom]:max-h-[85dvh]"
              : "h-[85vh] max-h-[85vh] data-[vaul-drawer-direction=bottom]:max-h-[85vh]"
          )}
        >
          <DrawerHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border pt-4 pb-3">
            <DrawerTitle>품명 검색</DrawerTitle>
            <DrawerDescription className="sr-only">품명 또는 품번으로 검색</DrawerDescription>
            <DrawerClose
              aria-label="닫기"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </DrawerClose>
          </DrawerHeader>

          <div className="shrink-0 px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                className="h-11 w-full rounded-lg border border-input bg-transparent pl-9 pr-10 text-base outline-none focus:ring-2 focus:ring-ring/30"
              />
              {search && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => { setSearch(""); inputRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-4">
            {filtered.length === 0 && matchingPending.length === 0 ? (
              trimmed ? (
                <button
                  type="button"
                  onClick={triggerCreate}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left text-sm text-primary hover:bg-accent"
                >
                  <Plus className="size-4" />
                  <span className="flex-1 truncate">&quot;{trimmed}&quot; 직접 입력</span>
                  <CornerDownLeft className="size-4 opacity-60" />
                </button>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">결과 없음</div>
              )
            ) : (
              <ul className="flex flex-col">
                {matchingPending.length > 0 && (
                  <>
                    <li className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      이미 입력된 신규 항목
                    </li>
                    {matchingPending.map((p) => (
                      <li key={`pending-${p.rowIndex}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectPending(p)}
                          className="flex min-h-12 w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="flex-1 truncate">{p.name}</span>
                          {p.spec && (
                            <span className="text-xs text-muted-foreground ml-1">({p.spec})</span>
                          )}
                          <Badge variant="outline" className="ml-2 text-xs text-primary border-primary/40">
                            행 {p.rowIndex + 1} 재사용
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </>
                )}

                {filtered.length > 0 && matchingPending.length > 0 && (
                  <li className="my-1 border-t border-border" />
                )}

                {filtered.map((p) => {
                  const alreadyAdded = existingIds.includes(p.id);
                  const disabled = disableAlreadyAdded && alreadyAdded;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => { if (!disabled) handleSelect(p); }}
                        className={cn(
                          "flex min-h-12 w-full items-center gap-2 rounded-md px-4 py-2 text-left text-sm hover:bg-muted",
                          disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                        )}
                      >
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.supplierCode && (
                          <span className="text-xs text-muted-foreground mr-2">{p.supplierCode}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          ₩{parseFloat(p.unitPrice).toLocaleString("ko-KR")}
                        </span>
                        {alreadyAdded && (
                          <Badge
                            variant={disableAlreadyAdded ? "secondary" : "outline"}
                            className={cn(
                              "ml-2 text-xs",
                              !disableAlreadyAdded && "text-yellow-500 border-yellow-500/40",
                            )}
                          >
                            추가됨
                          </Badge>
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
                      className="mt-1 flex w-full items-center gap-2 rounded-md px-4 py-3 text-left text-sm text-primary hover:bg-accent"
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
        </DrawerContent>
      </Drawer>
    </>
  );
}
