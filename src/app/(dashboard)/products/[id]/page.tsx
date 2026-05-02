"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
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
  updateProductFields,
  type ProductFieldsInput,
} from "@/lib/product-mutations";

import {
  ProductBulkCard,
  ProductChannelPricingTable,
  ProductSpecsTable,
  ProductDescriptionBlock,
  ProductHeaderBar,
  ProductInfoCard,
  ProductInventoryCard,
  ProductInventoryLotsTable,
  ProductKpiCards,
  ProductMappingsTable,
  ProductMovementsTable,
  ProductSection,
  ProductSellingCostsTable,
  ProductVariantsCard,
  ProductCostBreakdownCard,
  ProductChannelMarginCard,
  ComponentIncomingInfoSections,
  computeAvgInboundUnitCost,
  computeCostSum,
  toVatPrice,
} from "@/components/product";
import { ProductInfoEditSheet } from "@/components/product/edit/product-info-edit-sheet";
import { ProductMappingEditSheet } from "@/components/product/edit/product-mapping-edit-sheet";
import { ProductCostsEditSheet } from "@/components/product/edit/product-costs-edit-sheet";
import { ProductChannelPricingEditSheet } from "@/components/product/edit/product-channel-pricing-edit-sheet";
import { ProductSpecsEditSheet } from "@/components/product/edit/product-specs-edit-sheet";
import { ProductSetComponentsEditSheet } from "@/components/product/edit/product-set-components-edit-sheet";
import { Pencil } from "lucide-react";
import { ProductMediaManager } from "@/components/product-media-manager";
import { ShippingHistoryCard } from "@/components/shipping-history-card";
import type { ProductDetail } from "@/components/product/types";
import type { Movement } from "./_types";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [infoEditOpen, setInfoEditOpen] = useState(false);
  const [mappingEditOpen, setMappingEditOpen] = useState(false);
  const [costsEditOpen, setCostsEditOpen] = useState(false);
  const [channelEditOpen, setChannelEditOpen] = useState(false);
  const [specsEditOpen, setSpecsEditOpen] = useState(false);
  const [setComponentsEditOpen, setSetComponentsEditOpen] = useState(false);

  const productQuery = useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => apiGet<ProductDetail>(`/api/products/${id}`),
  });
  const product = productQuery.data;

  const cardFeeQuery = useQuery({
    queryKey: queryKeys.cardFeeRate.all,
    queryFn: () =>
      apiGet<{ current: { rate: string } | null }>("/api/card-fee-rate"),
  });
  const cardFeeRate = cardFeeQuery.data?.current
    ? parseFloat(cardFeeQuery.data.current.rate)
    : 0;

  // 변형(variant) 진입 시 부모 상품으로 redirect — 변형 운영은 부모 상세에서
  useEffect(() => {
    if (product?.canonicalProductId) {
      router.replace(`/products/${product.canonicalProductId}`);
    }
  }, [product?.canonicalProductId, router]);

  const movementsQuery = useQuery({
    queryKey: queryKeys.products.movements(id),
    queryFn: () => apiGet<Movement[]>(`/api/inventory/movements?productId=${id}`),
    enabled: !!product,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/products/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("상품이 비활성 처리되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      router.push("/products");
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "비활성 처리 실패"),
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

  // 인라인 편집 헬퍼: 현재 product 의 모든 필드를 베이스로 1개 필드만 덮어쓰고 PUT.
  const buildFieldsBase = (): ProductFieldsInput => ({
    name: product.name,
    sku: product.sku,
    brand: product.brandRef?.name ?? product.brand ?? null,
    brandId: product.brandId ?? null,
    modelName: product.modelName ?? null,
    spec: product.spec ?? null,
    description: product.description ?? null,
    unitOfMeasure: product.unitOfMeasure,
    productType: product.productType as ProductFieldsInput["productType"],
    taxType: product.taxType as ProductFieldsInput["taxType"],
    taxRate: product.taxRate ?? "0.1",
    listPrice: product.listPrice ?? product.sellingPrice,
    sellingPrice: product.sellingPrice,
    isSet: product.isSet,
    isBulk: product.isBulk,
    containerSize: product.containerSize ?? null,
    bulkProductId: product.bulkProductId ?? null,
    imageUrl: product.imageUrl ?? null,
    memo: product.memo ?? null,
    categoryId: product.categoryId ?? null,
    assemblyTemplateId: product.assemblyTemplateId ?? null,
    zeroRateEligible: product.zeroRateEligible,
  });
  const saveSingleField = (patch: Partial<ProductFieldsInput>) =>
    updateProductFields(product.id, { ...buildFieldsBase(), ...patch });

  // 가격 인라인: VAT 포함 입력 → 세전 변환 후 저장
  const taxRate = parseFloat(product.taxRate ?? "0.1");
  const isTaxablePrice = product.taxType !== "TAX_FREE";
  const vatInputToNet = (vatStr: string): string => {
    const vat = parseInt(vatStr.replace(/,/g, ""), 10) || 0;
    if (isTaxablePrice && taxRate > 0) {
      return String(Math.round(vat / (1 + taxRate)));
    }
    return String(vat);
  };
  const saveSellingPriceFromVat = (vatStr: string) =>
    saveSingleField({ sellingPrice: vatInputToNet(vatStr) });
  const saveListPriceFromVat = (vatStr: string) =>
    saveSingleField({ listPrice: vatInputToNet(vatStr) });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <ProductHeaderBar
            product={product}
            onSaveName={(name) => saveSingleField({ name })}
            onSaveImageUrl={(imageUrl) =>
              apiMutate("/api/product-media", "POST", {
                productId: product.id,
                type: "IMAGE",
                url: imageUrl,
                setPrimary: true,
              }).then(() => undefined)
            }
            actions={
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                onClick={() => setDeleteOpen(true)}
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />비활성
              </Button>
            }
          />

          {/* 1. 개요 */}
          <ProductKpiCards product={product} cardFeeRate={cardFeeRate} />
          <ProductCostBreakdownCard
            product={product}
            onEdit={
              product.isSet || product.productType === "ASSEMBLED"
                ? () => setSetComponentsEditOpen(true)
                : undefined
            }
          />
          {(product.isSet || product.productType === "ASSEMBLED") && (
            <ComponentIncomingInfoSections
              rows={(product.estimatedCostBreakdown ?? []).map((b) => ({
                componentId: b.componentId,
                componentName: b.componentName,
                componentSku: b.componentSku,
                label: b.label,
                quantity: b.quantity,
                shippingPerUnit: b.shippingPerUnit,
                incomingCostPerUnit: b.incomingCostPerUnit,
                supplierName: b.supplierName,
                supplierProductName: b.supplierProductName,
                incomingCostList: b.incomingCostList,
              }))}
            />
          )}
          <ProductChannelMarginCard product={product} />
          {product.isCanonical && (
            <ProductVariantsCard
              productId={product.id}
              taxType={product.taxType}
              variants={product.variants ?? []}
              parentSetComponentsEmpty={(product.setComponents ?? []).length === 0}
            />
          )}
          <ProductInfoCard product={product} onEdit={() => setInfoEditOpen(true)} />
          <ProductDescriptionBlock
            product={product}
            onSaveDescription={(description) => saveSingleField({ description: description || null })}
            onSaveMemo={(memo) => saveSingleField({ memo: memo || null })}
          />

          {/* 2. 가격·비용 */}
          <ProductSection
            title="전사 공통 판매비용"
            description="모든 채널에 공통으로 적용되는 비용"
            noPadding
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setCostsEditOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                편집
              </Button>
            }
          >
            <ProductSellingCostsTable costs={globalCosts} />
          </ProductSection>

          <ProductSection
            title="채널별 가격 · 비용 · 마진"
            description="채널 전용 비용 상세는 우측 (i) 버튼"
            noPadding
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setChannelEditOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                편집
              </Button>
            }
          >
            <ProductChannelPricingTable
              taxType={product.taxType}
              baseCost={baseCost}
              globalCostTotal={globalCostTotal}
              pricings={product.channelPricings ?? []}
              costsByChannel={costsByChannel}
              baseSellingPrice={parseFloat(product.sellingPrice || "0")}
              baseInboundCost={computeAvgInboundUnitCost(product)}
              listPriceVat={displayList}
              sellingPriceVat={displayVat}
              discount={discount}
              onSaveListPriceFromVat={saveListPriceFromVat}
              onSaveSellingPriceFromVat={saveSellingPriceFromVat}
              productId={product.id}
              cardFeeRate={cardFeeRate}
            />
          </ProductSection>

          <ProductSection
            title="상세 스펙"
            description="필터·검색용 구조화된 스펙 정보"
            noPadding
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setSpecsEditOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                편집
              </Button>
            }
          >
            <ProductSpecsTable values={product.specValues ?? []} />
          </ProductSection>

          {/* 3. 공급·재고 */}
          <ProductSection
            title="공급자 매핑"
            description="이 판매상품으로 환산되는 공급자 상품"
            noPadding
            actions={
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setMappingEditOpen(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                편집
              </Button>
            }
          >
            <ProductMappingsTable mappings={mappings} />
          </ProductSection>

          {mappings.map((m) => (
            <div key={`shipping-${m.id}`} className="space-y-2">
              <div className="text-xs text-muted-foreground px-1">
                {m.supplierProduct.name}
                {m.supplierProduct.supplierCode ? ` · ${m.supplierProduct.supplierCode}` : ""}
              </div>
              <ShippingHistoryCard supplierProductId={m.supplierProduct.id} />
            </div>
          ))}

          <ProductInventoryCard product={product} />
          <ProductSection
            title="재고 로트 (잔여, 최근 5건)"
            description="FIFO 소진 순으로 표시"
            noPadding
          >
            <ProductInventoryLotsTable
              lots={product.inventoryLots ?? []}
              limit={5}
              showVariantColumn={!!product.isCanonical}
            />
          </ProductSection>

          {/* 4. 구성·관계 (조건부) — 세트/조립 구성품은 위쪽 "구성품 · 예상 원가 분해" 카드로 통합됨 */}
          {!product.isSet && product.productType !== "ASSEMBLED" && !product.isCanonical && (
            <ProductBulkCard product={product} />
          )}

          {/* 5. 미디어 */}
          <ProductSection
            title="이미지 · 영상"
            description="POS 카탈로그·판매 화면에 함께 노출됩니다"
            noPadding
          >
            <ProductMediaManager
              productId={product.id}
              imageUrl={product.imageUrl}
              onImageUrlChange={() =>
                queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) })
              }
            />
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
              showVariantColumn={!!product.isCanonical}
            />
          </ProductSection>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>상품을 비활성 처리할까요?</DialogTitle>
            <DialogDescription>
              상품 데이터는 유지되며, 목록에서만 숨겨집니다 (매핑·비용·채널가격·이력 모두 보존). 필요 시 복구 가능합니다.
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
              비활성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductInfoEditSheet
        open={infoEditOpen}
        onOpenChange={setInfoEditOpen}
        product={product}
      />
      <ProductMappingEditSheet
        open={mappingEditOpen}
        onOpenChange={setMappingEditOpen}
        product={product}
      />
      <ProductCostsEditSheet
        open={costsEditOpen}
        onOpenChange={setCostsEditOpen}
        product={product}
        channelId={null}
      />
      <ProductChannelPricingEditSheet
        open={channelEditOpen}
        onOpenChange={setChannelEditOpen}
        product={product}
      />
      <ProductSpecsEditSheet
        open={specsEditOpen}
        onOpenChange={setSpecsEditOpen}
        product={product}
      />
      <ProductSetComponentsEditSheet
        open={setComponentsEditOpen}
        onOpenChange={setSetComponentsEditOpen}
        product={product}
      />
    </div>
  );
}

