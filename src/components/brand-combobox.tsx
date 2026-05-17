"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

export interface BrandOption {
  id: string;
  name: string;
  logoUrl?: string | null;
}

type BrandItem = JmComboboxItem & {
  brand: BrandOption;
};

interface BrandComboboxProps {
  brands: BrandOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  size?: "sm" | "md" | "lg";
}

export function BrandCombobox({
  brands,
  value,
  onChange,
  onCreateNew,
  placeholder = "브랜드 선택...",
  clearable = true,
  size = "sm",
}: BrandComboboxProps) {
  const items = useMemo<BrandItem[]>(
    () =>
      brands.map((b) => ({
        id: b.id,
        label: b.name,
        brand: b,
      })),
    [brands],
  );

  return (
    <JmCombobox<BrandItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.brand.id, item.brand.name)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="브랜드 검색..."
      emptyMessage="브랜드가 없습니다"
      clearable={clearable}
      onClear={() => onChange("", "")}
      matches={(item, q) =>
        item.brand.name.toLowerCase().includes(q.toLowerCase())
      }
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {item.brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.brand.logoUrl}
              alt=""
              className="size-4 shrink-0 rounded object-contain bg-[var(--jm-surface)] border border-[var(--jm-border)]"
            />
          )}
          <span className="truncate text-[var(--jm-text)]">{item.brand.name}</span>
        </span>
      )}
    />
  );
}
