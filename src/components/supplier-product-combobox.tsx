"use client";

import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

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

interface SupplierProductComboboxProps {
  supplierProducts: SupplierProduct[];
  value: string;
  onChange: (sp: SupplierProduct) => void;
  onCreateNew: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function SupplierProductCombobox({
  supplierProducts,
  value,
  onChange,
  onCreateNew,
  placeholder = "공급상품 선택...",
  disabled = false,
}: SupplierProductComboboxProps) {
  const selected = supplierProducts.find((s) => s.id === value);
  const selectedLabel = selected
    ? `${selected.name}${selected.spec ? ` (${selected.spec})` : ""}`
    : undefined;

  return (
    <ResponsiveCombobox<SupplierProduct>
      items={supplierProducts}
      value={value}
      getItemId={(s) => s.id}
      matches={(s, q) => {
        const lower = q.toLowerCase();
        return (
          s.name.toLowerCase().includes(lower) ||
          (s.supplierCode?.toLowerCase().includes(lower) ?? false)
        );
      }}
      onSelect={(s) => onChange(s)}
      onCreateNew={onCreateNew}
      selectedLabel={selectedLabel}
      placeholder={placeholder}
      searchPlaceholder="품명 또는 품번 검색..."
      mobileTitle="공급상품 선택"
      disabled={disabled}
      renderItem={(s) => (
        <>
          <span className="flex-1">{s.name}{s.spec ? ` (${s.spec})` : ""}</span>
          {s.supplierCode && (
            <span className="text-xs text-muted-foreground mr-2">{s.supplierCode}</span>
          )}
          <span className="text-xs text-muted-foreground">
            ₩{parseFloat(s.unitPrice).toLocaleString("ko-KR")}
          </span>
        </>
      )}
    />
  );
}
