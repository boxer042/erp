"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";

export interface JmComboboxDrawerProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  items: T[];
  loading?: boolean;

  getKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  onSelect: (item: T) => void;

  filterFn?: (item: T, query: string) => boolean;
  /** 외부 검색 모드 (서버측 필터) — query 변경 통보 */
  onQueryChange?: (query: string) => void;

  onCreate?: (query: string) => void;
  createLabel?: (query: string) => React.ReactNode;

  title?: string;
  placeholder?: string;
  emptyText?: string;

  /**
   * 시트 높이. 기본 "90dvh" (고정).
   * dvh(dynamic viewport height) = 모바일 가상 키보드가 올라오면 자동 축소.
   * vh 대신 dvh 를 써야 키보드가 시트를 가리지 않음.
   * 고정 높이로 두는 이유: onQueryChange(서버 필터) 모드에서 items 가 비어있다가
   * 채워질 때 popup 크기가 흔들리는 것을 방지 — 검색 워크스페이스는 안정적이어야 함.
   */
  height?: string;
}

/**
 * 콤보박스 드로워 — 바텀시트 형태의 검색 가능한 select.
 *
 * 모바일/태블릿 친화 설계:
 * - 시트는 하단 fixed, max-height 가 dvh 단위 → 가상 키보드가 뜨면 viewport 가 줄어들어
 *   시트가 자동으로 같이 짧아짐. 결과적으로 시트 하단이 키보드 위에 안착, 콘텐츠 안 밀림.
 * - 검색 input 은 시트 상단에 고정 (입력 중 항상 보임).
 * - 결과 리스트만 그 아래에서 스크롤 → 키보드가 결과 가림 방지.
 * - safe-area-inset-bottom 자동 적용 (iOS notch/home indicator).
 *
 * 트리거는 외부에서 별도 렌더 (이 컴포넌트는 시트 본체만).
 */
export function JmComboboxDrawer<T>({
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
  height = "90dvh",
}: JmComboboxDrawerProps<T>) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      // 모바일에서 키보드 올라오는 거 보장하려고 약간 지연 후 focus
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  const trimmed = query.trim();
  const filtered = React.useMemo(() => {
    if (onQueryChange) return items;
    if (!trimmed) return items;
    if (!filterFn) return items;
    return items.filter((it) => filterFn(it, trimmed));
  }, [items, trimmed, filterFn, onQueryChange]);

  const showCreate = onCreate && trimmed;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/30 transition-opacity duration-200",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "supports-backdrop-filter:backdrop-blur-sm",
          )}
        />
        <DialogPrimitive.Popup
          data-jm-scope
          // 핵심: bottom-0 + height: dvh → 가상키보드 올라오면 시트가 자동으로 같이 짧아짐.
          // height 를 직접 지정해 콘텐츠 크기에 따라 popup 이 흔들리지 않게 함 (onQueryChange 모드 안정성).
          style={{ height }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-[var(--jm-surface)] text-[var(--jm-text)] font-[family-name:var(--jm-font-sans)] shadow-[var(--jm-shadow-lg)] outline-none",
            "transition-transform duration-300 ease-out",
            "data-starting-style:translate-y-full data-ending-style:translate-y-full",
          )}
        >
          {/* 드래그 핸들 — 시각적 표시 */}
          <div
            aria-hidden
            className="flex shrink-0 justify-center pt-3 pb-1.5"
          >
            <div className="h-1 w-10 rounded-full bg-[var(--jm-border-strong)]" />
          </div>

          {/* 헤더 — 제목 + X */}
          {title && (
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
              <DialogPrimitive.Title className="flex-1 text-jm-lg font-bold text-[var(--jm-text)]">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="닫기"
                className="-mr-1 inline-flex size-9 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          )}

          {/* 검색 input — 시트 상단 고정. 키보드 올라와도 항상 시야 안에 있음 */}
          <div className="shrink-0 px-4 pb-3">
            <div className="relative">
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
                className="h-11 w-full rounded-xl bg-[var(--jm-surface-muted)] pl-9 pr-9 text-jm-md text-[var(--jm-text)] placeholder:text-[var(--jm-text-subtle)] outline-none focus:bg-[var(--jm-bg)] focus:ring-2 focus:ring-[var(--jm-ring)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    onQueryChange?.("");
                    inputRef.current?.focus();
                  }}
                  aria-label="지우기"
                  className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--jm-text-muted)] hover:bg-[var(--jm-bg)] hover:text-[var(--jm-text)]"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 리스트 — 남은 공간 모두 사용. 키보드 떠도 이 영역 만 줄어듦. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <SkeletonList />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <span className="text-jm-base text-[var(--jm-text-muted)]">
                  {emptyText}
                </span>
                {showCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreate?.(trimmed);
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
                {showCreate && (
                  <li className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        onCreate?.(trimmed);
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

          {/* iOS safe-area-inset-bottom 패딩 */}
          <div
            aria-hidden
            className="shrink-0"
            style={{
              height: "max(env(safe-area-inset-bottom), 0px)",
            }}
          />
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
