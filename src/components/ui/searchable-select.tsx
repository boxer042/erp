"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Plus, ChevronDown } from "lucide-react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  sub?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onCreateNew?: (name: string) => void;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "검색...",
  onCreateNew,
  createLabel = "새로 등록",
  disabled,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = options.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.label.toLowerCase().includes(q) ||
      (o.sub?.toLowerCase().includes(q) ?? false)
    );
  });

  const hasExactMatch = options.some(
    (o) => o.label.toLowerCase() === search.toLowerCase()
  );

  // 외부 클릭 시 닫기
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearch("");
  };

  const handleCreate = () => {
    if (onCreateNew && search.trim()) {
      onCreateNew(search.trim());
      setSearch("");
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 선택된 값 표시 or 검색 입력 */}
      {selected && !open ? (
        <div
          className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm cursor-pointer hover:bg-accent/50"
          onClick={() => {
            if (!disabled) {
              setOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
        >
          <div className="flex-1 truncate">
            <span>{selected.label}</span>
            {selected.sub && (
              <span className="ml-1.5 text-muted-foreground text-xs">{selected.sub}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="p-0.5 rounded hover:bg-accent"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-8 h-8"
          />
        </div>
      )}

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 && !onCreateNew && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              결과 없음
            </div>
          )}

          {filtered.map((option) => (
            <div
              key={option.value}
              className={cn(
                "flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-accent",
                option.value === value && "bg-accent font-medium"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(option.value)}
            >
              <span className="flex-1 truncate">{option.label}</span>
              {option.sub && (
                <span className="text-xs text-muted-foreground ml-2">{option.sub}</span>
              )}
            </div>
          ))}

          {/* 새로 등록 버튼 */}
          {onCreateNew && search.trim() && !hasExactMatch && (
            <div
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent border-t text-primary font-medium"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              {createLabel}: &quot;{search.trim()}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
