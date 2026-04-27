"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

import {
  ProductBulkCard,
  ProductChannelPricingTable,
  ProductDescriptionBlock,
  ProductHeaderBar,
  ProductInfoCard,
  ProductInventoryCard,
  ProductInventoryLotsTable,
  ProductKpiCards,
  ProductMappingsTable,
  ProductMediaGallery,
  ProductMovementsTable,
  ProductSection,
  ProductSellingCostsTable,
  ProductSetComponentsTable,
  ProductVariantsCard,
  computeCostSum,
  fmtPrice,
  toVatPrice,
} from "@/components/product";
import { ProductMediaManager } from "@/components/product-media-manager";
import type { ProductDetail } from "@/components/product/types";
import type { Movement } from "./_types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const productQuery = useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => apiGet<ProductDetail>(`/api/products/${id}`),
  });
  const product = productQuery.data;

  const movementsQuery = useQuery({
    queryKey: queryKeys.products.movements(id),
    queryFn: () => apiGet<Movement[]>(`/api/inventory/movements?productId=${id}`),
    enabled: !!product,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/products/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("상품이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      router.push("/products");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  if (productQuery.isPending) return null; // loading.tsx 가 처리
  if (!product)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        상품을 찾을 수 없습니다
      </div>
    );

  // 파생값
  const mappings = product.productMappings ?? [];
  const costs = product.sellingCosts ?? [];
  const globalCosts = costs.filter((c) => c.channelId == null);
  const costsByChannel = costs.reduce<Record<string, typeof costs>>((acc, c) => {
    if (c.channelId) (acc[c.channelId] ??= []).push(c);
    return acc;
  }, {});
  const baseCost = mappings[0]
    ? parseFloat(mappings[0].supplierProduct.unitPrice) /
      parseFloat(mappings[0].conversionRate || "1")
    : 0;
  const globalCostTotal = computeCostSum(globalCosts, parseFloat(product.sellingPrice));
  const displayVat = toVatPrice(product.sellingPrice, product.taxType);
  const displayList = product.listPrice
    ? toVatPrice(product.listPrice, product.taxType)
    : null;
  const discount =
    displayList && displayList > displayVat
      ? Math.round(((displayList - displayVat) / displayList) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <ProductHeaderBar
            product={product}
            actions={
              <>
                <Link href={`/products/${id}/edit`}>
                  <Button size="sm" className="h-8">
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />수정
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />삭제
                </Button>
              </>
            }
          />

          {/* 1. 개요 */}
          <ProductKpiCards product={product} />
          {product.isCanonical && (
            <ProductVariantsCard
              productId={product.id}
              taxType={product.taxType}
              variants={product.variants ?? []}
            />
          )}
          <ProductInfoCard product={product} />
          <ProductDescriptionBlock product={product} />

          {/* 2. 가격·비용 */}
          <ProductSection title="가격 요약">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-sm">
              <Stat label="정가 (VAT 포함)" value={displayList != null ? `₩${fmtPrice(displayList)}` : "—"} />
              <Stat label="판매가 (VAT 포함)" value={`₩${fmtPrice(displayVat)}`} />
              <Stat label="할인율" value={discount > 0 ? `${discount}%` : "—"} />
              <Stat
                label="원가 / 전사비용"
                value={`₩${fmtPrice(baseCost)} / ₩${fmtPrice(globalCostTotal)}`}
              />
            </div>
          </ProductSection>

          <ProductSection
            title="전사 공통 판매비용"
            description="모든 채널에 공통으로 적용되는 비용"
            noPadding
          >
            <ProductSellingCostsTable costs={globalCosts} />
          </ProductSection>

          <ProductSection
            title="채널별 가격 · 비용 · 마진"
            description="채널 전용 비용 상세는 우측 (i) 버튼"
            noPadding
          >
            <ProductChannelPricingTable
              taxType={product.taxType}
              baseCost={baseCost}
              globalCostTotal={globalCostTotal}
              pricings={product.channelPricings ?? []}
              costsByChannel={costsByChannel}
            />
          </ProductSection>

          {/* 3. 공급·재고 */}
          <ProductSection
            title="공급자 매핑"
            description="이 판매상품으로 환산되는 공급자 상품"
            noPadding
          >
            <ProductMappingsTable mappings={mappings} />
          </ProductSection>
          <ProductInventoryCard product={product} />
          <ProductSection
            title="재고 로트 (잔여, 최근 5건)"
            description="FIFO 소진 순으로 표시"
            noPadding
          >
            <ProductInventoryLotsTable lots={product.inventoryLots ?? []} limit={5} />
          </ProductSection>

          {/* 4. 구성·관계 (조건부) */}
          {(product.isSet || product.productType === "ASSEMBLED") && (
            <ProductSection
              title="세트 / 조립 구성품"
              description={
                product.productType === "ASSEMBLED"
                  ? "조립상품의 구성 부품"
                  : "세트 상품의 구성품"
              }
              noPadding
            >
              <ProductSetComponentsTable components={product.setComponents ?? []} />
            </ProductSection>
          )}
          {!product.isSet && product.productType !== "ASSEMBLED" && !product.isCanonical && (
            <ProductBulkCard product={product} />
          )}

          {/* 5. 미디어 */}
          <ProductSection
            title="이미지 · 영상"
            description="POS 카탈로그·판매 화면에 함께 노출됩니다"
          >
            <div className="space-y-6">
              <ProductMediaGallery
                imageUrl={product.imageUrl}
                media={product.media}
                productName={product.name}
                bare
              />
              <div className="border-t border-border pt-4">
                <ProductMediaManager productId={product.id} />
              </div>
            </div>
          </ProductSection>

          {/* 6. 이력 */}
          <ProductSection
            title="재고 이동 이력"
            description="최근 100건"
            noPadding
          >
            <ProductMovementsTable
              movements={movementsQuery.data}
              isLoading={movementsQuery.isPending}
            />
          </ProductSection>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>상품을 삭제할까요?</DialogTitle>
            <DialogDescription>
              비활성 처리됩니다 (소프트 삭제). 매핑·비용·채널가격은 유지되지만 목록에서 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
