"use client";

import { useMemo } from "react";
import { JmCombobox, type JmComboboxItem } from "@/jm";
import { normalizeSearch } from "@/lib/utils";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
  /** 규격 — 같은 이름 상품의 변형 구분 (예: "100ml", "L사이즈") */
  spec?: string | null;
  sellingPrice: string;
  /** 공식 판매 정가(세전) — 카트 라인 정가 비교에 사용 */
  listPrice?: string;
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
  /** 카테고리 — 조립 슬롯라벨 카테고리 필터링 등에 사용 */
  categoryId?: string | null;
  taxType?: string;
  zeroRateEligible?: boolean;
  /** 활성 ProductOption 슬롯 보유 여부 — POS 카트가 "옵션 선택" 트리거 노출용 */
  hasProductOptions?: boolean;
  /** Product.productType — OPTION_PARENT 등 필터링용 */
  productType?: "FINISHED" | "PARTS" | "SET" | "ASSEMBLED" | "OPTION_PARENT";
  /** 상품 대표 이미지 — 옵션 연결 카드 썸네일 등 */
  imageUrl?: string | null;
}

type ProductItem = JmComboboxItem & {
  product: ProductOption;
};

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
  size?: "sm" | "md" | "lg";
}

const EMPTY_OPTION: ProductOption = {
  id: "",
  name: "",
  sku: "",
  spec: null,
  sellingPrice: "0",
  unitCost: null,
  unitOfMeasure: "EA",
  isSet: false,
};

/** JmCombobox 기반 판매상품 선택. */
export function ProductCombobox({
  products,
  value,
  onChange,
  filterType,
  placeholder = "상품 선택...",
  disabled = false,
  clearable = true,
  size = "sm",
}: ProductComboboxProps) {
  const items = useMemo<ProductItem[]>(() => {
    // "set" 모드: 세트/조립상품 중 변형(canonicalProductId 가 있는) 은 가림. 대표 또는 단일만.
    // "component" 모드: BOM 구성품 선택용 — ASSEMBLED·SET 도 sub-assembly 로 사용 가능하므로
    //                   isSet 은 필터링하지 않고, OPTION_PARENT 만 제외 (가상 SKU, 소비 불가).
    const filtered =
      filterType === "set"
        ? products.filter((p) => p.isSet && !p.canonicalProductId)
        : filterType === "component"
          ? products.filter((p) => p.productType !== "OPTION_PARENT")
          : products;
    return filtered.map((p) => ({
      id: p.id,
      label: `${p.name}${p.spec ? ` · ${p.spec}` : ""}`,
      description: p.sku,
      product: p,
    }));
  }, [products, filterType]);

  return (
    <JmCombobox<ProductItem>
      items={items}
      value={value}
      size={size}
      onChange={(item) => onChange(item.product)}
      placeholder={placeholder}
      searchPlaceholder="상품명·규격·SKU 검색..."
      emptyMessage="상품이 없습니다"
      clearable={clearable}
      onClear={() => onChange(EMPTY_OPTION)}
      disabled={disabled}
      matches={(item, q) => {
        const nq = normalizeSearch(q);
        const p = item.product;
        return (
          normalizeSearch(p.name).includes(nq) ||
          normalizeSearch(p.sku).includes(nq) ||
          (p.spec ? normalizeSearch(p.spec).includes(nq) : false)
        );
      }}
      renderItem={(item) => {
        const p = item.product;
        return (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {p.isCanonical && (
              <span className="shrink-0 rounded bg-[var(--jm-info-bg)] px-1.5 py-0.5 text-jm-2xs font-semibold text-[var(--jm-info-fg)]">
                그룹
              </span>
            )}
            <span className="flex-1 truncate text-[var(--jm-text)]">
              {p.name}
              {p.spec && (
                <span className="ml-1 text-[var(--jm-text-muted)]">· {p.spec}</span>
              )}
            </span>
            <span className="ml-auto shrink-0 text-jm-xs text-[var(--jm-text-muted)] tabular-nums">
              {p.sku}
            </span>
          </span>
        );
      }}
    />
  );
}
