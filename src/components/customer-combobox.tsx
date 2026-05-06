"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS";
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
          {c.type === "BUSINESS" && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0 text-[9px] font-semibold text-amber-800">
              기업
            </span>
          )}
          <span>{c.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {c.type === "BUSINESS" && c.businessNumber
              ? c.businessNumber
              : c.phone}
          </span>
        </>
      )}
    />
  );
}
