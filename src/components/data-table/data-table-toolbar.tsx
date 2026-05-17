"use client";

import { JmButton, JmIconButton, JmInput } from "@/jm";
import { Search, RefreshCw, Plus } from "lucide-react";

interface DataTableToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    onSearch: () => void;
    placeholder?: string;
  };
  onRefresh?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  filters?: React.ReactNode;
  loading?: boolean;
}

export function DataTableToolbar({
  search,
  onRefresh,
  onAdd,
  addLabel = "추가",
  filters,
  loading,
}: DataTableToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--jm-border)] px-5 py-2.5">
      <div className="flex items-center gap-2 flex-1">
        {search && (
          <div className="relative max-w-[320px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--jm-text-muted)] pointer-events-none" />
            <JmInput
              size="sm"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) search.onSearch();
              }}
              placeholder={search.placeholder || "검색..."}
              className="pl-8"
            />
          </div>
        )}
        {filters}
      </div>
      <div className="flex items-center gap-1.5">
        {onRefresh && (
          <JmIconButton
            variant="ghost"
            size="sm"
            aria-label="새로고침"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </JmIconButton>
        )}
        {onAdd && (
          <JmButton size="sm" variant="cta" onClick={onAdd}>
            <Plus />
            <span>{addLabel}</span>
          </JmButton>
        )}
      </div>
    </div>
  );
}
