"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}

interface CustomerComboboxProps {
  customers: Customer[];
  value: string;
  onChange: (id: string, customer: Customer) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
}

const EMPTY_CUSTOMER: Customer = { id: "", name: "" };

export function CustomerCombobox({
  customers,
  value,
  onChange,
  onCreateNew,
  placeholder = "고객 선택...",
}: CustomerComboboxProps) {
  const selected = customers.find((c) => c.id === value);

  return (
    <ResponsiveCombobox<Customer>
      items={customers}
      value={value}
      getItemId={(c) => c.id}
      matches={(c, q) => {
        const lower = q.toLowerCase();
        return (
          c.name.toLowerCase().includes(lower) ||
          (c.phone?.toLowerCase().includes(lower) ?? false) ||
          (c.businessNumber?.toLowerCase().includes(lower) ?? false)
        );
      }}
      onSelect={(c) => onChange(c.id, c)}
      onCreateNew={onCreateNew}
      selectedLabel={selected?.name}
      placeholder={placeholder}
      searchPlaceholder="고객 검색..."
      mobileTitle="고객 선택"
      clearable
      onClear={() => onChange("", EMPTY_CUSTOMER)}
      renderItem={(c) => (
        <>
          <span>{c.name}</span>
          {c.phone && (
            <span className="ml-auto text-xs text-muted-foreground">{c.phone}</span>
          )}
        </>
      )}
    />
  );
}
