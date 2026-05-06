"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { MobileCombobox } from "./_components/mobile-combobox";
import type { ProductOption } from "@/components/product-combobox";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (p: ProductOption) => void;
}

/**
 * 상품 카탈로그 검색 — MobileCombobox 사용.
 * 한 번에 전체 상품 fetch + 클라이언트측 부분일치 필터.
 */
export function ProductSearchSheet({ open, onOpenChange, onSelect }: Props) {
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ["pos-v2", "products"],
    queryFn: () =>
      apiGet<ProductOption[]>("/api/products?isBulk=all&excludeVariants=true"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  return (
    <MobileCombobox<ProductOption>
      open={open}
      onOpenChange={onOpenChange}
      title="상품 검색"
      placeholder="상품명·SKU 검색"
      items={productsQuery.data ?? []}
      loading={productsQuery.isPending}
      filterFn={(p, q) =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.sku.toLowerCase().includes(q.toLowerCase())
      }
      getKey={(p) => p.id}
      renderItem={(p) => <ProductRow product={p} />}
      onSelect={onSelect}
      emptyText="상품 없음"
    />
  );
}

function ProductRow({ product }: { product: ProductOption }) {
  const price = parseFloat(product.sellingPrice) || 0;
  return (
    <>
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-subtle)]">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 6l7-4 7 4v8l-7 4-7-4V6zM10 2v16M3 6l7 4 7-4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
          {product.name}
        </span>
        <span className="font-mono text-[11px] text-[var(--jm-text-subtle)]">{product.sku}</span>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[13px] font-semibold tabular-nums text-[var(--jm-text)]">
          ₩{price.toLocaleString("ko-KR")}
        </div>
        <div className="text-[10px] text-[var(--jm-text-subtle)]">{product.unitOfMeasure}</div>
      </div>
    </>
  );
}
