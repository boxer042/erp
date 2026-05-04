"use client";

interface CategoryChip {
  id: string;
  name: string;
}

interface Props {
  categories: CategoryChip[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}

/**
 * 카테고리 칩 가로 스크롤 — POS v2 표준 패턴.
 * "전체" + 각 카테고리. 큰 터치 타깃, 얇은 외곽선.
 */
export function CategoryChips({
  categories,
  selectedId,
  onSelect,
  loading,
}: Props) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6">
      <Chip
        active={selectedId === ""}
        onClick={() => onSelect("")}
        label="전체"
      />
      {loading
        ? Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-zinc-100"
            />
          ))
        : categories.map((c) => (
            <Chip
              key={c.id}
              active={selectedId === c.id}
              onClick={() => onSelect(c.id)}
              label={c.name}
            />
          ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
