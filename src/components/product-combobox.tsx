"use client";

import { useMemo } from "react";
import { ResponsiveCombobox } from "@/components/ui/responsive-combobox";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  unitCost: string | null;
  /** 분해 — 공급단가 (환산 후, 세전) */
  supplierUnitPrice?: string | number;
  /** 분해 — 개당 배송비 (세전) */
  shippingPerUnit?: string | number;
  /** 분해 — 개당 부대비용 (세전) */
  incomingCostPerUnit?: string | number;
  /** 매핑된 거래처 이름 (조립상품 분해 표시용) */
  supplierName?: string | null;
  /** 매핑된 거래처상품 이름 */
  supplierProductName?: string | null;
  /** 부대비용 목록 (조립상품 분해 표시용) */
  incomingCostList?: Array<{ name: string; costType: string; value: number; isTaxable: boolean }>;
  unitOfMeasure: string;
  isSet: boolean;
  isCanonical?: boolean;
  canonicalProductId?: string | null;
  taxType?: string;
}

interface ProductComboboxProps {
  products: ProductOption[];
  value: string;
  onChange: (product: ProductOption) => void;
  /** "set" — isSet=true인 상품만 표시 (부속의 상위 상품 연결용)
   *  "component" — isSet=false인 상품만 표시 (세트/조립 구성품 선택용, 기본값)
   *  undefined — 모두 표시 */
  filterType?: "set" | "component";
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}

const EMPTY_OPTION: ProductOption = {
  id: "",
  name: "",
  sku: "",
  sellingPrice: "0",
  unitCost: null,
  unitOfMeasure: "EA",
  isSet: false,
};

export function ProductCombobox({
  products,
  value,
  onChange,
  filterType,
  placeholder = "상품 선택...",
  disabled = false,
  clearable = true,
}: ProductComboboxProps) {
  const items = useMemo(() => {
    // "set" 모드: 세트/조립상품 중 변형(canonicalProductId 가 있는) 은 가림. 대표 또는 단일만.
    if (filterType === "set") return products.filter((p) => p.isSet && !p.canonicalProductId);
    if (filterType === "component") return products.filter((p) => !p.isSet);
    return products;
  }, [products, filterType]);

  const selected = items.find((p) => p.id === value);
  const selectedLabel = selected ? `${selected.name} (${selected.sku})` : undefined;

  return (
    <ResponsiveCombobox<ProductOption>
      items={items}
      value={value}
      getItemId={(p) => p.id}
      matches={(p, q) => {
        const lower = q.toLowerCase();
        return p.name.toLowerCase().includes(lower) || p.sku.toLowerCase().includes(lower);
      }}
      onSelect={(p) => onChange(p)}
      selectedLabel={selectedLabel}
      placeholder={placeholder}
      searchPlaceholder="상품명 또는 SKU 검색..."
      mobileTitle="상품 선택"
      clearable={clearable}
      onClear={() => onChange(EMPTY_OPTION)}
      disabled={disabled}
      renderItem={(p) => (
        <>
          {p.isCanonical && (
            <span className="mr-1.5 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              그룹
            </span>
          )}
          <span className="flex-1 truncate">{p.name}</span>
          <span className="ml-2 text-xs text-muted-foreground shrink-0">{p.sku}</span>
        </>
      )}
    />
  );
}
