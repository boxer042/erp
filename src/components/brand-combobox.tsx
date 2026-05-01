"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

export interface BrandOption {
  id: string;
  name: string;
  logoUrl?: string | null;
}

interface BrandComboboxProps {
  brands: BrandOption[];
  value: string;
  onChange: (id: string, name: string) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
}

export function BrandCombobox({
  brands,
  value,
  onChange,
  onCreateNew,
  placeholder = "브랜드 선택...",
  clearable = true,
}: BrandComboboxProps) {
  const selected = brands.find((b) => b.id === value);

  return (
    <ResponsiveCombobox<BrandOption>
      items={brands}
      value={value}
      getItemId={(b) => b.id}
      matches={(b, q) => b.name.toLowerCase().includes(q.toLowerCase())}
      onSelect={(b) => onChange(b.id, b.name)}
      onCreateNew={onCreateNew}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="브랜드 검색..."
      mobileTitle="브랜드 선택"
      clearable={clearable}
      onClear={() => onChange("", "")}
      renderTrigger={(s) => (
        <>
          {s?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.logoUrl}
              alt=""
              className="mr-2 size-5 shrink-0 rounded object-contain bg-card border border-border"
            />
          )}
          <span className={`truncate ${s ? "" : "text-muted-foreground"}`}>
            {s ? s.name : placeholder}
          </span>
        </>
      )}
      renderItem={(b) => (
        <>
          {b.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={b.logoUrl}
              alt=""
              className="h-4 w-4 rounded object-contain bg-card border border-border"
            />
          )}
          <span>{b.name}</span>
        </>
      )}
    />
  );
}
