"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

interface SupplierComboboxProps {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  /** 트리거 높이 — 기본 sm (h-9), 다른 jm input 과 통일 */
  size?: "sm" | "md" | "lg";
}

/** JmCombobox 기반 거래처 선택. */
export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  onCreateNew,
  placeholder = "거래처 선택...",
  clearable = true,
  size = "sm",
}: SupplierComboboxProps) {
  const items = useMemo<JmComboboxItem[]>(
    () =>
      suppliers.map((s) => ({
        id: s.id,
        label: s.name,
        description: s.businessNumber ?? undefined,
      })),
    [suppliers],
  );

  return (
    <JmCombobox
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.id, item.label)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="거래처 검색..."
      emptyMessage="거래처가 없습니다"
      clearable={clearable}
      onClear={() => onChange("", "")}
      matches={(item, q) => {
        const lower = q.toLowerCase();
        return (
          item.label.toLowerCase().includes(lower) ||
          (item.description?.toLowerCase().includes(lower) ?? false)
        );
      }}
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[var(--jm-text)]">{item.label}</span>
          {item.description && (
            <span className="ml-auto shrink-0 text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
              {item.description}
            </span>
          )}
        </span>
      )}
    />
  );
}
