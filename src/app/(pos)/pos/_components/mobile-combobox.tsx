"use client";

import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

interface Props<T> {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 검색·표시할 데이터. 비동기 로드는 부모가 처리. */
  items: T[];
  loading?: boolean;
  /** 검색 매칭 — 부모가 query 받아 필터링한 결과를 items 로 넘기는 패턴 권장 */
  onQueryChange?: (q: string) => void;
  /** 디폴트 클라이언트측 필터 — onQueryChange 미사용시 사용 */
  filterFn?: (item: T, query: string) => boolean;
  /** 행 키 */
  getKey: (item: T) => string;
  /** 행 렌더 */
  renderItem: (item: T) => React.ReactNode;
  /** 선택 콜백 */
  onSelect: (item: T) => void;
  /** 입력값으로 새 항목 생성 — 결과 0건일 때 표시 */
  onCreate?: (query: string) => void;
  createLabel?: string;
  title?: string;
  placeholder?: string;
  emptyText?: string;
}

/**
 * 모바일 친화 콤보박스. 풀스크린 모달 + 큰 입력 + 큰 행.
 * - shadcn 0개
 * - 거래처/상품/고객 등 어디든 재사용 (제네릭)
 * - "+ 새로 등록" 인라인 버튼 (onCreate 제공 시)
 */
export function MobileCombobox<T>(props: Props<T>) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body<T>({
  onOpenChange,
  items,
  loading,
  onQueryChange,
  filterFn,
  getKey,
  renderItem,
  onSelect,
  onCreate,
  createLabel,
  title = "검색",
  placeholder = "이름·코드 검색",
  emptyText = "결과 없음",
}: Props<T>) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useBodyScrollLock();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = onQueryChange
    ? items
    : !q.trim()
      ? items
      : items.filter((it) => (filterFn ? filterFn(it, q.trim()) : false));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--jm-surface)]">
      {/* 헤더 */}
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="닫기"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12 4l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onQueryChange?.(e.target.value);
            }}
            placeholder={placeholder}
            className="h-11 flex-1 rounded-xl bg-[var(--jm-surface-muted)] px-4 text-[15px] outline-none placeholder:text-[var(--jm-text-subtle)] focus:bg-[var(--jm-bg)]"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                onQueryChange?.("");
                inputRef.current?.focus();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--jm-text-subtle)] hover:bg-[var(--jm-surface-muted)]"
              aria-label="지우기"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
        {title && (
          <div className="px-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
            {title}
          </div>
        )}
      </header>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="text-[14px] text-[var(--jm-text-muted)]">{emptyText}</span>
            {onCreate && q.trim() && (
              <button
                type="button"
                onClick={() => onCreate(q.trim())}
                className="flex h-11 items-center gap-2 rounded-full bg-[var(--jm-action)] px-5 text-[14px] font-semibold text-white"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M7 3v8M3 7h8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {createLabel ?? `"${q}" 새로 등록`}
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
                  className="flex w-full items-center gap-3 border-b border-[var(--jm-border)] px-4 py-3 text-left active:bg-[var(--jm-bg)] sm:hover:bg-[var(--jm-bg)]"
                >
                  {renderItem(it)}
                </button>
              </li>
            ))}
            {/* 결과 있어도 onCreate 가능하면 하단에 등록 버튼 */}
            {onCreate && q.trim() && (
              <li className="px-4 py-4">
                <button
                  type="button"
                  onClick={() => onCreate(q.trim())}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--jm-surface-muted)] text-[13px] font-semibold text-[var(--jm-text)] hover:bg-[var(--jm-border)]"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 3v8M3 7h8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  {createLabel ?? `"${q}" 새로 등록`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
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
