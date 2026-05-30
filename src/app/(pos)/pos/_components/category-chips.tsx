"use client";

import { LayoutGrid } from "lucide-react";

interface CategoryChip {
  id: string;
  name: string;
  imageUrl?: string | null;
}

interface Props {
  categories: CategoryChip[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

/**
 * 카테고리 썸네일 가로 스크롤 — POS v2 표준 패턴.
 * "전체" + 각 카테고리. 원형 썸네일 + 라벨.
 */
export function CategoryChips({
  categories,
  selectedId,
  onSelect,
  loading,
}: Props) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
      <Chip
        active={selectedId === ""}
        onClick={() => onSelect("")}
        label="전체"
        imageUrl={null}
        isAll
      />
      {loading
        ? Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <div className="size-14 animate-pulse rounded-2xl bg-[var(--jm-surface-muted)]" />
              <div className="h-3 w-10 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            </div>
          ))
        : categories.map((c) => (
            <Chip
              key={c.id}
              active={selectedId === c.id}
              onClick={() => onSelect(c.id)}
              label={c.name}
              imageUrl={c.imageUrl ?? null}
            />
          ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  imageUrl,
  isAll,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  imageUrl: string | null;
  isAll?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-16 shrink-0 flex-col items-center gap-1.5"
    >
      <div
        className={`flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-[var(--jm-bg)] transition-colors ${
          active ? "ring-[1.5px] ring-[var(--jm-action)]" : "border border-[var(--jm-border)]"
        }`}
      >
        {isAll ? (
          <LayoutGrid
            className={`size-[22px] ${active ? "text-[var(--jm-text)]" : "text-[var(--jm-text-subtle)]"}`}
            strokeWidth={1.6}
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            className={`text-jm-md font-semibold ${
              active ? "text-[var(--jm-text)]" : "text-[var(--jm-text-subtle)]"
            }`}
          >
            {label.charAt(0)}
          </span>
        )}
      </div>
      <span
        className={`line-clamp-1 max-w-full text-jm-2xs ${
          active ? "font-semibold text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
