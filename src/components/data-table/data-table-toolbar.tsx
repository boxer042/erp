"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
      <div className="flex items-center gap-2 flex-1">
        {search && (
          <div className="relative max-w-[320px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) search.onSearch(); }}
              placeholder={search.placeholder || "검색..."}
              className="h-[30px] pl-8 text-[13px]"
            />
          </div>
        )}
        {filters}
      </div>
      <div className="flex items-center gap-1.5">
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-[30px] w-[30px] text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
        {onAdd && (
          <Button
            size="sm"
            className="h-[30px] px-3 text-[13px]"
            onClick={onAdd}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
