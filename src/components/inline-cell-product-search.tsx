"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Plus } from "lucide-react";

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
import { JmBadge, JmTooltip } from "@/jm";
import { normalizeSearch } from "@/lib/utils";
import { useIsCompactDevice } from "@/hooks/use-mobile";
import {
  MobileInlineCellProductSearch,
  type PendingNewProduct,
  type SupplierProductLike,
} from "@/components/inline-cell-product-search-mobile";

export type { PendingNewProduct, SupplierProductLike };

interface InlineCellProductSearchProps<T extends SupplierProductLike> {
  rowIndex: number;
  products: T[];
  onSelect: (product: T) => void;
  /** 검색어로 새 항목 생성 — incoming/initial 은 pending row 추가, returns 는 거래처상품 등록 시트 호출 */
  onCreateNew: (name: string) => void;
  /** 이미 다른 행에 추가된 공급상품 id 목록 — 시각 배지 또는 비활성화 처리 */
  existingIds: string[];
  selectedName?: string;

  // ── 옵션 모드 (incoming/initial 만 사용) ────────────────────────────
  /** 이 행이 새 항목(pending)에서 만들어졌거나 재사용 중일 때 표시 */
  isNew?: boolean;
  /** 다른 행에서 만든 pending 을 재사용 중이면 그 원본 행 번호 */
  pendingSourceRow?: number;
  /** 폼 안에서 생성된 새 항목 목록 — "이미 입력된 신규 항목" 그룹 노출 */
  pendingNewProducts?: PendingNewProduct[];
  /** 위 그룹에서 항목 선택 시 콜백 */
  onSelectPending?: (item: PendingNewProduct) => void;
  /** 공급상품 fetch 중 표시 (거래처 변경 직후 등) */
  loading?: boolean;

  // ── 옵션 모드 (returns 등) ─────────────────────────────────────────
  /** true 이면 existingIds 매칭 항목을 비활성화(선택 불가). false (기본) 면 배지만 표시 */
  disableAlreadyAdded?: boolean;
}

/**
 * 테이블 셀 내 공급상품 검색 — incoming / initial / returns 공용.
 *
 * - 데스크탑 (≥1024px non-touch): h-7 Popover + Command (테이블 셀 밀도 유지)
 * - 모바일/태블릿: MobileInlineCellProductSearch (JmDrawer 바텀시트)
 *
 * 검색 필드: name · supplierCode · spec (normalizeSearch — 한국어 초/중/종성 분리 매칭).
 * IME 안전성: Enter 처리 시 isComposing 가드.
 * "직접 입력" Enter UX: onCreateNew 콜백 호출 — 페이지 측에서 pending row 추가 또는 시트 오픈.
 *
 * @example
 * // 풀 기능 (incoming/initial)
 * <InlineCellProductSearch
 *   rowIndex={idx}
 *   products={supplierProducts}
 *   onSelect={(sp) => selectRow(idx, sp)}
 *   onCreateNew={(name) => addPendingRow(idx, name)}
 *   existingIds={items.map((i) => i.supplierProductId)}
 *   selectedName={item.name}
 *   isNew={item.isNew}
 *   pendingSourceRow={item.pendingSourceRow}
 *   pendingNewProducts={pendingNewProducts}
 *   onSelectPending={(p) => reusePendingFromRow(idx, p)}
 *   loading={spQuery.isPending}
 * />
 *
 * @example
 * // 단순 모드 (returns) — pending/loading 없이 중복만 막음
 * <InlineCellProductSearch
 *   rowIndex={idx}
 *   products={supplierProducts}
 *   onSelect={(sp) => selectRow(idx, sp)}
 *   onCreateNew={(name) => openQuickRegisterSheet(name)}
 *   existingIds={items.map((i) => i.supplierProductId).filter(Boolean)}
 *   selectedName={item.supplierProductName}
 *   disableAlreadyAdded
 * />
 */
export function InlineCellProductSearch<T extends SupplierProductLike>({
  rowIndex,
  products,
  onSelect,
  onCreateNew,
  existingIds,
  selectedName = "",
  isNew = false,
  pendingSourceRow,
  pendingNewProducts,
  onSelectPending,
  loading = false,
  disableAlreadyAdded = false,
}: InlineCellProductSearchProps<T>) {
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
        onCreateNew={onCreateNew}
        existingIds={existingIds}
        selectedName={selectedName}
        isNew={isNew}
        pendingSourceRow={pendingSourceRow}
        pendingNewProducts={pendingNewProducts}
        onSelectPending={onSelectPending}
        disableAlreadyAdded={disableAlreadyAdded}
        loading={loading}
      />
    );
  }

  const trimmed = search.trim();
  const nq = normalizeSearch(trimmed);

  const filtered = products.filter((p) => {
    return (
      normalizeSearch(p.name).includes(nq) ||
      (p.supplierCode ? normalizeSearch(p.supplierCode).includes(nq) : false) ||
      (p.spec ? normalizeSearch(p.spec).includes(nq) : false)
    );
  });

  const hasExactMatch = trimmed
    ? products.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
    : false;

  const triggerCreate = () => {
    const val = searchRef.current.trim();
    if (!val) return;
    setOpen(false);
    setSearch("");
    // setTimeout 0 — Popover close 와 onCreateNew (시트 오픈/state 변경) race 회피
    setTimeout(() => onCreateNew(val), 0);
  };

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
          className={`relative flex h-7 max-h-7 box-border w-full items-center overflow-hidden rounded bg-transparent px-2 text-jm-sm cursor-pointer hover:bg-[var(--jm-surface-muted)] focus:outline-none focus-visible:outline-none ${
            selectedName ? "text-[var(--jm-text)]" : "text-[var(--jm-text-subtle)]"
          }`}
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
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter" && trimmed && filtered.length === 0) {
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
                ) : trimmed ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-jm-sm text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] rounded cursor-pointer"
                    onClick={triggerCreate}
                  >
                    <Plus className="size-4" />
                    &quot;{trimmed}&quot; 직접 입력
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
                    normalizeSearch(p.name).includes(nq),
                ).length > 0 && (
                  <CommandGroup heading="이미 입력된 신규 항목">
                    {pendingNewProducts
                      .filter(
                        (p) =>
                          p.rowIndex !== rowIndex &&
                          normalizeSearch(p.name).includes(nq),
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
                  const itemDisabled = disableAlreadyAdded && alreadyAdded;
                  return (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      disabled={itemDisabled}
                      onSelect={() => {
                        if (itemDisabled) return;
                        onSelect(p);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <span className="flex-1 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{p.name}</span>
                        {p.spec && (
                          <span className="text-jm-xs text-[var(--jm-text-muted)] shrink-0">
                            ({p.spec})
                          </span>
                        )}
                        {p.hasMapping === false && (
                          <JmTooltip content="매핑 없음 — 등록 시 오르판 로트로 들어감">
                            <span className="size-1.5 rounded-full bg-[var(--jm-warning-solid)] shrink-0" />
                          </JmTooltip>
                        )}
                      </span>
                      {p.supplierCode && (
                        <span className="text-jm-xs text-[var(--jm-text-muted)] mr-2 shrink-0">
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

              {trimmed && filtered.length > 0 && !hasExactMatch && (
                <CommandGroup>
                  <CommandItem onSelect={triggerCreate}>
                    <Plus className="size-4" />
                    &quot;{trimmed}&quot; 직접 입력
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
