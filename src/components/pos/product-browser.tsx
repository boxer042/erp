"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
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
      params.set("excludeVariants", "true");
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
        <ScrollArea className="shrink-0 bg-background">
          <div className="flex items-stretch gap-2 px-3 py-3 sm:px-4">
            <CategoryCard
              active={categoryId === ""}
              onClick={() => setCategoryId("")}
              label="전체"
              imageUrl={null}
            />
            {categoriesQuery.data.map((c) => (
              <CategoryCard
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

function CategoryCard({
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
    <Card
      onClick={onClick}
      className={cn(
        "group relative aspect-square w-25 shrink-0 cursor-pointer overflow-hidden p-0 transition-shadow hover:shadow-md",
        active && "ring-2 ring-primary"
      )}
    >
      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={label}
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 py-1.5">
            <div
              className={cn(
                "line-clamp-1 text-center text-xs text-white",
                active ? "font-semibold" : "font-medium"
              )}
            >
              {label}
            </div>
          </div>
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted">
          <Grid3x3 className="size-7 text-muted-foreground" />
          <div
            className={cn(
              "line-clamp-1 px-2 text-center text-xs text-foreground",
              active && "font-semibold"
            )}
          >
            {label}
          </div>
        </div>
      )}
    </Card>
  );
}
