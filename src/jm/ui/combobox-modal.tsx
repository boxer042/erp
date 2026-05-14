"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmComboboxModalProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** 검색·표시할 데이터 */
  items: T[];
  loading?: boolean;

  /** 행 키 추출 */
  getKey: (item: T) => string;
  /** 행 렌더 */
  renderItem: (item: T) => React.ReactNode;
  /** 선택 콜백 — 선택 시 자동으로 모달 닫힘 */
  onSelect: (item: T) => void;

  /** 클라이언트측 필터 — 항목과 query 받아 boolean. 미지정 시 필터링 안 함 */
  filterFn?: (item: T, query: string) => boolean;
  /** 외부 검색 모드 — query 변경을 부모에게 전달 (서버측 필터링 등) */
  onQueryChange?: (query: string) => void;

  /** 결과 0건이거나 검색어 있을 때 "새로 등록" 버튼 */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => React.ReactNode;

  title?: string;
  placeholder?: string;
  emptyText?: string;
}

/**
 * 풀스크린 모달형 콤보박스. 모바일/터치 친화적, 큰 입력·큰 행.
 * POS 헤더의 상품/고객/거래처 검색 같은 스탠드얼론 검색에 적합.
 *
 * 트리거는 외부에서 직접 렌더 (이 컴포넌트는 모달 본체만).
 * - open/onOpenChange 로 부모가 제어
 * - 선택 시 자동 close
 * - ESC / 백드롭 클릭 / 좌상단 X 로 닫기
 * - 자동 focus 트랩, body scroll lock (Dialog primitive)
 */
export function JmComboboxModal<T>({
  open,
  onOpenChange,
  items,
  loading,
  getKey,
  renderItem,
  onSelect,
  filterFn,
  onQueryChange,
  onCreate,
  createLabel,
  title,
  placeholder = "검색...",
  emptyText = "결과 없음",
}: JmComboboxModalProps<T>) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 열릴 때 입력 초기화 + 포커스
  React.useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const trimmed = query.trim();
  const filtered = React.useMemo(() => {
    if (onQueryChange) return items; // 부모가 필터링
    if (!trimmed) return items;
    if (!filterFn) return items;
    return items.filter((it) => filterFn(it, trimmed));
  }, [items, trimmed, filterFn, onQueryChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          data-jm-scope
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-[var(--jm-surface)] text-[var(--jm-text)] font-[family-name:var(--jm-font-sans)] outline-none",
            "transition-opacity duration-200",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
          )}
        >
          {/* 헤더 — 뒤로 + 검색 입력 + 지우기 */}
          <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
            <div className="flex items-center gap-2 px-3 py-2">
              <DialogPrimitive.Close
                aria-label="닫기"
                className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)] outline-none"
              >
                <ArrowLeft className="size-5" />
              </DialogPrimitive.Close>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--jm-text-subtle)]" />
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    onQueryChange?.(e.target.value);
                  }}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-xl bg-[var(--jm-surface-muted)] pl-9 pr-3 text-jm-md text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none focus:bg-[var(--jm-bg)] focus:ring-2 focus:ring-[var(--jm-ring)]"
                />
              </div>
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onQueryChange?.("");
                    inputRef.current?.focus();
                  }}
                  aria-label="지우기"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {title && (
              <DialogPrimitive.Title className="px-4 pb-2 text-jm-2xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
                {title}
              </DialogPrimitive.Title>
            )}
          </header>

          {/* 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <SkeletonList />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <span className="text-jm-base text-[var(--jm-text-muted)]">
                  {emptyText}
                </span>
                {onCreate && trimmed && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreate(trimmed);
                      onOpenChange(false);
                    }}
                    className="flex h-11 items-center gap-2 rounded-full bg-[var(--jm-action)] px-5 text-jm-base font-semibold text-[var(--jm-action-fg)]"
                  >
                    <Plus className="size-4" />
                    {createLabel ? createLabel(trimmed) : `"${trimmed}" 새로 등록`}
                  </button>
                )}
              </div>
            ) : (
              <ul className="flex flex-col">
                {filtered.map((it) => (
                  <li key={getKey(it)}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(it);
                        onOpenChange(false);
                      }}
                      className="flex w-full items-center gap-3 border-b border-[var(--jm-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-surface-muted)]"
                    >
                      {renderItem(it)}
                    </button>
                  </li>
                ))}
                {onCreate && trimmed && (
                  <li className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => {
                        onCreate(trimmed);
                        onOpenChange(false);
                      }}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--jm-surface-muted)] text-jm-sm font-semibold text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                    >
                      <Plus className="size-4" />
                      {createLabel ? createLabel(trimmed) : `"${trimmed}" 새로 등록`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SkeletonList() {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-b border-[var(--jm-border)] px-4 py-3"
        >
          <div className="size-10 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
        </li>
      ))}
    </ul>
  );
}
