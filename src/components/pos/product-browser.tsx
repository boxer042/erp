"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { ProductGrid, type ProductLite } from "@/components/pos/product-grid";

interface CategoryRoot {
  id: string;
  name: string;
  imageUrl: string | null;
  children: { id: string; name: string }[];
}

interface Props {
  sessionId: string;
  enabled?: boolean;
}

export function ProductBrowser({ sessionId, enabled = true }: Props) {
  const { add } = useSessions();
  const [categoryId, setCategoryId] = useState<string>("");

  const categoriesQuery = useQuery({
    queryKey: ["pos", "categories"],
    queryFn: () => apiGet<CategoryRoot[]>("/api/categories"),
    enabled,
  });

  const productsQuery = useQuery({
    queryKey: ["pos", "products", { categoryId }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      return apiGet<ProductLite[]>(`/api/products?${params}`);
    },
    enabled,
  });

  const handleProductSelect = (p: ProductLite) => {
    add(
      {
        productId: p.id,
        itemType: "product",
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        unitPrice: Number(p.sellingPrice),
        taxType: p.taxType === "TAX_FREE" ? "TAX_FREE" : "TAXABLE",
        zeroRateEligible: p.zeroRateEligible,
        isBulk: p.isBulk,
        unitOfMeasure: p.unitOfMeasure,
        isCanonical: p.isCanonical,
      },
      { sessionId }
    );
    toast.success(`${p.name} 추가됨`);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 카테고리 서브탭 */}
      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <ScrollArea className="shrink-0 border-b border-border bg-background">
          <div className="flex items-stretch gap-2 px-3 py-2">
            <CategoryChip
              active={categoryId === ""}
              onClick={() => setCategoryId("")}
              label="전체"
              imageUrl={null}
            />
            {categoriesQuery.data.map((c) => (
              <CategoryChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                label={c.name}
                imageUrl={c.imageUrl}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* 상품 그리드 */}
      <div className="flex-1 overflow-y-auto">
        <ProductGrid
          products={productsQuery.data ?? []}
          loading={productsQuery.isPending}
          onSelect={handleProductSelect}
        />
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  imageUrl,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  imageUrl: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-[68px] shrink-0 flex-col items-center gap-1 px-2 py-1.5"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={label}
          className="size-10 rounded-md object-cover"
        />
      ) : (
        <Grid3x3
          className={cn(
            "size-10 p-2",
            active ? "text-foreground" : "text-muted-foreground"
          )}
        />
      )}
      <span
        className={cn(
          "line-clamp-1 text-xs",
          active ? "font-semibold text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );
}
