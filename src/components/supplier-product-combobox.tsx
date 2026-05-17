"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";
import { normalizeSearch } from "@/lib/utils";

interface SupplierProductCostItem {
  id: string;
  name: string;
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  perUnit: boolean;
  isTaxable: boolean;
}

interface SupplierProduct {
  id: string;
  name: string;
  spec?: string | null;
  supplierCode?: string | null;
  unitPrice: string;
  unitOfMeasure: string;
  incomingCosts?: SupplierProductCostItem[];
}

type SpItem = JmComboboxItem & {
  sp: SupplierProduct;
};

interface SupplierProductComboboxProps {
  supplierProducts: SupplierProduct[];
  value: string;
  onChange: (sp: SupplierProduct) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function SupplierProductCombobox({
  supplierProducts,
  value,
  onChange,
  onCreateNew,
  placeholder = "공급상품 선택...",
  disabled = false,
  size = "sm",
}: SupplierProductComboboxProps) {
  const items = useMemo<SpItem[]>(
    () =>
      supplierProducts.map((s) => ({
        id: s.id,
        label: `${s.name}${s.spec ? ` · ${s.spec}` : ""}`,
        sp: s,
      })),
    [supplierProducts],
  );

  return (
    <JmCombobox<SpItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.sp)}
      onCreateNew={onCreateNew}
      placeholder={placeholder}
      searchPlaceholder="품명·규격·품번 검색..."
      emptyMessage="공급상품이 없습니다"
      disabled={disabled}
      matches={(item, q) => {
        const nq = normalizeSearch(q);
        const s = item.sp;
        return (
          normalizeSearch(s.name).includes(nq) ||
          (s.supplierCode ? normalizeSearch(s.supplierCode).includes(nq) : false) ||
          (s.spec ? normalizeSearch(s.spec).includes(nq) : false)
        );
      }}
      renderItem={(item) => {
        const s = item.sp;
        return (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex-1 truncate text-[var(--jm-text)]">
              {s.name}
              {s.spec && (
                <span className="ml-1 text-[var(--jm-text-muted)]">· {s.spec}</span>
              )}
            </span>
            {s.supplierCode && (
              <span className="text-jm-xs text-[var(--jm-text-muted)] shrink-0 font-[family-name:var(--jm-font-mono)]">
                {s.supplierCode}
              </span>
            )}
            <span className="text-jm-xs text-[var(--jm-text-muted)] shrink-0 tabular-nums">
              ₩{parseFloat(s.unitPrice).toLocaleString("ko-KR")}
            </span>
          </span>
        );
      }}
    />
  );
}
