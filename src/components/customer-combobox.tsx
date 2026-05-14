"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
  type?: "INDIVIDUAL" | "BUSINESS";
}

type CustomerItem = JmComboboxItem & {
  customer: Customer;
};

interface CustomerComboboxProps {
  customers: Customer[];
  value: string;
  onChange: (id: string, customer: Customer) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  clearable?: boolean;
  size?: "sm" | "md" | "lg";
}

const EMPTY_CUSTOMER: Customer = { id: "", name: "" };

/** JmCombobox 기반 고객 선택. 기업이면 기업 배지 + 사업자번호, 개인이면 전화번호 표시. */
export function CustomerCombobox({
  customers,
  value,
  onChange,
  onCreateNew,
  placeholder = "고객 선택...",
  clearable = true,
  size = "sm",
}: CustomerComboboxProps) {
  const items = useMemo<CustomerItem[]>(
    () =>
      customers.map((c) => ({
        id: c.id,
        label: c.name,
        description:
          c.type === "BUSINESS" && c.businessNumber
            ? c.businessNumber
            : c.phone ?? undefined,
        customer: c,
      })),
    [customers],
  );

  return (
    <JmCombobox<CustomerItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.id, item.customer)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="고객 검색..."
      emptyMessage="고객이 없습니다"
      clearable={clearable}
      onClear={() => onChange("", EMPTY_CUSTOMER)}
      matches={(item, q) => {
        const lower = q.toLowerCase();
        const c = item.customer;
        return (
          c.name.toLowerCase().includes(lower) ||
          (c.phone?.toLowerCase().includes(lower) ?? false) ||
          (c.businessNumber?.toLowerCase().includes(lower) ?? false)
        );
      }}
      renderItem={(item) => (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {item.customer.type === "BUSINESS" && (
            <span className="shrink-0 rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0 text-jm-2xs font-semibold text-[var(--jm-warning-fg)]">
              기업
            </span>
          )}
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
