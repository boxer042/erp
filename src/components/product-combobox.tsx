"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import {
  JmCombobox,
  JmComboboxDrawer,
  type JmComboboxItem,
} from "@/jm";
import { normalizeSearch } from "@/lib/utils";
import { useIsCompactDevice } from "@/hooks/use-mobile";

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
  /**
   * UsedItem marker — 검색 결과에 중고 단품도 통합 표시할 때 사용.
   * id 는 UsedItem.id (Product 와 별개 UUID), name 은 자동 "(중고)" prefix 부착.
   * onChange 콜백에서 이 필드 있으면 UsedItem 흐름으로 분기.
   */
  usedItemId?: string;
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

/** 옵션값 렌더링 — 데스크탑 콤보박스 결과 + 모바일 드로워 결과 모두 사용 */
function renderProductItem(p: ProductOption) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {p.isCanonical && (
        <span className="shrink-0 rounded bg-[var(--jm-success-bg)] px-1.5 py-0.5 text-jm-2xs font-semibold text-[var(--jm-success-fg)]">
          변형대표
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
}

function matchesProduct(p: ProductOption, q: string) {
  const nq = normalizeSearch(q);
  return (
    normalizeSearch(p.name).includes(nq) ||
    normalizeSearch(p.sku).includes(nq) ||
    (p.spec ? normalizeSearch(p.spec).includes(nq) : false)
  );
}

/**
 * 판매상품 선택 콤보박스.
 *
 * - 데스크탑 (mouse, ≥1024px): 기존 JmCombobox 팝오버
 * - 모바일/태블릿 (≤1023px 또는 coarse pointer): JmComboboxDrawer (바텀시트)
 *   가상 키보드가 떠도 dvh 단위로 자동 축소돼 입력창/결과 안 가려짐.
 */
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
  const isCompact = useIsCompactDevice();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    // "set" 모드: 세트/조립상품 중 변형(canonicalProductId 가 있는) 은 가림. 대표 또는 단일만.
    // "component" 모드: BOM 구성품 선택용 — ASSEMBLED·SET 도 sub-assembly 로 사용 가능하므로
    //                   isSet 은 필터링하지 않고, OPTION_PARENT 만 제외 (가상 SKU, 소비 불가).
    return filterType === "set"
      ? products.filter((p) => p.isSet && !p.canonicalProductId)
      : filterType === "component"
        ? products.filter((p) => p.productType !== "OPTION_PARENT")
        : products;
  }, [products, filterType]);

  const items = useMemo<ProductItem[]>(
    () =>
      filteredProducts.map((p) => ({
        id: p.id,
        label: `${p.name}${p.spec ? ` · ${p.spec}` : ""}`,
        description: p.sku,
        product: p,
      })),
    [filteredProducts],
  );

  // 모바일/태블릿 — 트리거 버튼 + JmComboboxDrawer
  if (isCompact) {
    const selected = filteredProducts.find((p) => p.id === value) ?? null;
    return (
      <>
        <button
          type="button"
          onClick={() => !disabled && setDrawerOpen(true)}
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-jm-sm text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className={`truncate text-left ${
              selected ? "text-[var(--jm-text)]" : "text-[var(--jm-text-muted)]"
            }`}
          >
            {selected
              ? `${selected.name}${selected.spec ? ` · ${selected.spec}` : ""}`
              : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="선택 해제"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(EMPTY_OPTION);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(EMPTY_OPTION);
                  }
                }}
                className="rounded p-0.5 text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-strong)] hover:text-[var(--jm-text)]"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-3.5 text-[var(--jm-text-muted)]" />
          </span>
        </button>
        <JmComboboxDrawer<ProductItem>
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          items={items}
          getKey={(item) => item.id}
          renderItem={(item) => renderProductItem(item.product)}
          onSelect={(item) => {
            onChange(item.product);
            setDrawerOpen(false);
          }}
          filterFn={(item, q) => matchesProduct(item.product, q)}
          title="상품 선택"
          placeholder="상품명·규격·SKU 검색..."
          emptyText="상품이 없습니다"
        />
      </>
    );
  }

  // 데스크탑 — 기존 JmCombobox 팝오버
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
      matches={(item, q) => matchesProduct(item.product, q)}
      renderItem={(item) => renderProductItem(item.product)}
    />
  );
}
