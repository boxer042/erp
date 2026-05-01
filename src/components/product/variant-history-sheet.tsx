"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiGet } from "@/lib/api-client";
import { ProductInventoryLotsTable } from "./product-inventory-lots-table";
import { ProductMovementsTable } from "./product-movements-table";
import { ProductSection } from "./product-section";
import type { InventoryLotItem, InventoryMovementItem, ProductDetail } from "./types";

interface Props {
  variantId: string | null;
  variantName?: string;
  variantSku?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VariantHistorySheet({ variantId, variantName, variantSku, open, onOpenChange }: Props) {
  const lotsQuery = useQuery({
    queryKey: ["variant-history", "lots", variantId],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${variantId}`),
    enabled: !!variantId && open,
  });

  const movementsQuery = useQuery({
    queryKey: ["variant-history", "movements", variantId],
    queryFn: () => apiGet<InventoryMovementItem[]>(`/api/inventory/movements?productId=${variantId}`),
    enabled: !!variantId && open,
  });

  const lots: InventoryLotItem[] = lotsQuery.data?.inventoryLots ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 flex flex-col"
        style={{ height: "85vh", maxHeight: "85vh" }}
      >
        <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
          <SheetTitle>
            <div className="flex flex-col">
              <span>변형 운영 이력</span>
              {(variantName || variantSku) && (
                <span className="text-xs font-normal text-muted-foreground mt-0.5">
                  {variantName} {variantSku ? `· ${variantSku}` : ""}
                </span>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <ProductSection title="잔여 재고 로트" description="현재 잔량이 있는 모든 lot (FIFO 순)" noPadding>
            <ProductInventoryLotsTable lots={lots} limit={lots.length || 50} />
          </ProductSection>

          <ProductSection title="재고 이동 이력" description="최근 100건" noPadding>
            <ProductMovementsTable
              movements={movementsQuery.data}
              isLoading={movementsQuery.isPending}
            />
          </ProductSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}
