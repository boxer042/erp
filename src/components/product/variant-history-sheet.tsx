"use client";

import { useQuery } from "@tanstack/react-query";
import {
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
} from "@/jm";
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

export function VariantHistorySheet({
  variantId,
  variantName,
  variantSku,
  open,
  onOpenChange,
}: Props) {
  const lotsQuery = useQuery({
    queryKey: ["variant-history", "lots", variantId],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${variantId}`),
    enabled: !!variantId && open,
  });

  const movementsQuery = useQuery({
    queryKey: ["variant-history", "movements", variantId],
    queryFn: () =>
      apiGet<InventoryMovementItem[]>(`/api/inventory/movements?productId=${variantId}`),
    enabled: !!variantId && open,
  });

  const lots: InventoryLotItem[] = lotsQuery.data?.inventoryLots ?? [];

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size="xl"
        className="flex flex-col p-0"
        dragHandle={false}
      >
        <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
          <JmDrawerTitle>
            <div className="flex flex-col">
              <span>변형 운영 이력</span>
              {(variantName || variantSku) && (
                <span className="text-jm-xs font-normal text-[var(--jm-text-muted)] mt-0.5">
                  {variantName} {variantSku ? `· ${variantSku}` : ""}
                </span>
              )}
            </div>
          </JmDrawerTitle>
        </JmDrawerHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <ProductSection
            title="잔여 재고 로트"
            description="현재 잔량이 있는 모든 lot (FIFO 순)"
            noPadding
          >
            <ProductInventoryLotsTable lots={lots} limit={lots.length || 50} />
          </ProductSection>

          <ProductSection title="재고 이동 이력" description="최근 100건" noPadding>
            <ProductMovementsTable
              movements={movementsQuery.data}
              isLoading={movementsQuery.isPending}
            />
          </ProductSection>
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}
