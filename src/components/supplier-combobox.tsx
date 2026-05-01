"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

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
}

export function SupplierCombobox({
  suppliers,
  value,
  onChange,
  onCreateNew,
  placeholder = "거래처 선택...",
  clearable = true,
}: SupplierComboboxProps) {
  const selected = suppliers.find((s) => s.id === value);

  return (
    <ResponsiveCombobox<Supplier>
      items={suppliers}
      value={value}
      getItemId={(s) => s.id}
      matches={(s, q) => {
        const lower = q.toLowerCase();
        return (
          s.name.toLowerCase().includes(lower) ||
          (s.businessNumber?.toLowerCase().includes(lower) ?? false)
        );
      }}
      onSelect={(s) => onChange(s.id, s.name)}
      onCreateNew={onCreateNew}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="거래처 검색..."
      mobileTitle="거래처 선택"
      clearable={clearable}
      onClear={() => onChange("", "")}
      renderItem={(s) => (
        <>
          <span>{s.name}</span>
          {s.businessNumber && (
            <span className="ml-auto text-xs text-muted-foreground">{s.businessNumber}</span>
          )}
        </>
      )}
    />
  );
}
