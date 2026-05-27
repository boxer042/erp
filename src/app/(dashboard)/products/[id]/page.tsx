"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, BookOpen, Layout, Pencil } from "lucide-react";
import { toast } from "sonner";

import {
  JmAlert,
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogDescription,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmSpinner,
} from "@/jm";
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
  ProductOptionsTable,
  ProductBundlesTable,
  ProductParentsTable,
  ProductRepairUsageTable,
  ProductDescriptionBlock,
  ProductHeaderBar,
  ProductInfoCard,
  ProductInventoryCard,
  ProductInventoryLotsTable,
  ProductKpiCards,
  ProductMappingsTable,
  ProductMovementsTable,
  ProductPriceHistoryCard,
  ProductSalesPriceHistoryCard,
  ProductCostCauseCard,
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
import { ProductMergeDialog } from "@/components/product/merge-dialog";
import { ProductMappingEditSheet } from "@/components/product/edit/product-mapping-edit-sheet";
import { ProductCostsEditSheet } from "@/components/product/edit/product-costs-edit-sheet";
import { ProductChannelPricingEditSheet } from "@/components/product/edit/product-channel-pricing-edit-sheet";
import { ProductSpecsEditSheet } from "@/components/product/edit/product-specs-edit-sheet";
import { ProductOptionsEditSheet } from "@/components/product/edit/product-options-edit-sheet";
import { ProductBundlesEditSheet } from "@/components/product/edit/product-bundles-edit-sheet";
import { ProductSetComponentsEditSheet } from "@/components/product/edit/product-set-components-edit-sheet";
import { AssemblyRegisterSheet } from "@/components/assembly/assembly-register-sheet";
import { ProductMediaManager } from "@/components/product-media-manager";
import { ShippingHistoryCard } from "@/components/shipping-history-card";
import type { ProductDetail } from "@/components/product/types";
import type { Movement } from "./_types";
import { ProductsThemeScope } from "../_theme-scope";

/** 섹션 우측 [편집] 버튼 — 6개 섹션에서 동일 사용 */
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <JmButton size="xs" variant="outline" onClick={onClick}>
      <Pencil className="size-3" />
      편집
    </JmButton>
  );
}

/** 상세 그룹 정의 — 시각 구분 + 상단 앵커 내비 공용 */
type GroupDef = { id: string; label: string };

/** 그룹 헤더 — 좌측 액센트 바 + 굵은 제목. id 로 앵커 점프 대상 */
function GroupHeader({ id, label }: GroupDef) {
  return (
    <div id={id} className="flex scroll-mt-16 items-center gap-2 pt-2">
      <span className="h-4 w-1 rounded-full bg-[var(--jm-action)]" />
      <h2 className="text-jm-base font-bold text-[var(--jm-text)]">{label}</h2>
    </div>
  );
}

/** 상단 스티키 그룹 내비 — 클릭 시 해당 그룹으로 스크롤 */
function SectionNav({ groups }: { groups: GroupDef[] }) {
  return (
    <div className="sticky top-0 z-20 -mx-6 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-2">
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() =>
              document
                .getElementById(g.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-1 text-jm-xs text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]"
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [optionsEditOpen, setOptionsEditOpen] = useState(false);
  const [bundlesEditOpen, setBundlesEditOpen] = useState(false);
  const [setComponentsEditOpen, setSetComponentsEditOpen] = useState(false);
  const [assemblyRegisterOpen, setAssemblyRegisterOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

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

  const clearAutoMappedMutation = useMutation({
    mutationFn: () => apiMutate(`/api/products/${id}`, "PATCH", { autoMapped: false }),
    onSuccess: () => {
      toast.success("검토 완료로 표시했습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const acknowledgeCostMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/products/${id}/acknowledge-cost`, "POST"),
    onSuccess: async () => {
      toast.success("원가 변동을 확인 처리했습니다");
      // detail 을 await 으로 refetch 완료 보장. 안 그러면 stale cache 가
      // 잠시 더 costAlert 를 들고 있어 배너가 안 사라진 듯 보임.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.products.detail(id),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.products.costCause(id),
      });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const toggleCatalogMutation = useMutation({
    mutationFn: (hidden: boolean) =>
      apiMutate(`/api/products/${id}`, "PATCH", { catalogHidden: hidden }),
    onSuccess: (_data, hidden) => {
      toast.success(
        hidden
          ? "카탈로그에서 숨김 처리했습니다"
          : "카탈로그에 노출하도록 변경했습니다",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변경 실패"),
  });

  if (productQuery.isPending) return null; // loading.tsx 가 처리
  if (!product)
    return (
      <ProductsThemeScope>
        <div className="flex h-full items-center justify-center bg-[var(--jm-bg)] text-jm-sm text-[var(--jm-text-muted)]">
          상품을 찾을 수 없습니다
        </div>
      </ProductsThemeScope>
    );

  // 파생값
  // OPTION_PARENT — 자체 가격·재고·공급자 매핑이 없는 카탈로그 placeholder.
  // 가격/원가/채널/재고 관련 섹션은 무의미하므로 상세 페이지에서 숨긴다.
  const isOptionParent = product.productType === "OPTION_PARENT";

  // 상단 앵커 내비 그룹 — 가격·비용/공급·재고는 OPTION_PARENT 에서 숨김
  const navGroups: GroupDef[] = [
    { id: "grp-overview", label: "개요" },
    ...(!isOptionParent ? [{ id: "grp-pricing", label: "가격·비용" }] : []),
    { id: "grp-catalog", label: "구성·옵션" },
    ...(!isOptionParent ? [{ id: "grp-supply", label: "공급·재고" }] : []),
    { id: "grp-media", label: "미디어" },
    { id: "grp-history", label: "이력" },
  ];

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
    <ProductsThemeScope>
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            <ProductHeaderBar
              product={product}
              onSaveName={(name) => saveSingleField({ name })}
              onSaveSku={(sku) => saveSingleField({ sku })}
              actions={
                <>
                  <JmButton
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/products/${product.id}/landing`)}
                  >
                    <Layout className="size-3.5" />
                    상세페이지
                  </JmButton>
                  <JmButton
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/products/${product.id}/manual`)}
                  >
                    <BookOpen className="size-3.5" />
                    사용설명서
                  </JmButton>
                  <JmButton
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Archive className="size-3.5" />
                    비활성
                  </JmButton>
                </>
              }
            />

            <SectionNav groups={navGroups} />

            {product.autoMapped && (
              <JmAlert
                variant="info"
                title="자동 생성된 상품입니다"
                action={
                  <div className="flex shrink-0 gap-2">
                    <JmButton
                      size="sm"
                      variant="outline"
                      onClick={() => setMergeDialogOpen(true)}
                    >
                      합치기
                    </JmButton>
                    <JmButton
                      size="sm"
                      onClick={() => clearAutoMappedMutation.mutate()}
                      disabled={clearAutoMappedMutation.isPending}
                    >
                      {clearAutoMappedMutation.isPending && (
                        <JmSpinner size="sm" tone="inverted" />
                      )}
                      검토 완료
                    </JmButton>
                  </div>
                }
              >
                SKU/이름/판매가를 검토한 뒤 [검토 완료]를 눌러주세요. 다른 상품과
                같은 품목이라면 [합치기]로 통합할 수 있습니다.
              </JmAlert>
            )}

            {product.costAlert && (
              <JmAlert
                variant={product.costAlert.direction === "up" ? "danger" : "info"}
                title={
                  product.costAlert.direction === "up"
                    ? "원가가 상승했습니다"
                    : "원가가 하락했습니다"
                }
                action={
                  <div className="flex shrink-0 gap-2">
                    <JmButton
                      size="sm"
                      variant="outline"
                      onClick={() => setInfoEditOpen(true)}
                    >
                      판매가 조정
                    </JmButton>
                    <JmButton
                      size="sm"
                      onClick={() => acknowledgeCostMutation.mutate()}
                      disabled={acknowledgeCostMutation.isPending}
                    >
                      {acknowledgeCostMutation.isPending && (
                        <JmSpinner size="sm" tone="inverted" />
                      )}
                      확인
                    </JmButton>
                  </div>
                }
              >
                이전 ₩{Math.round(product.costAlert.oldCost).toLocaleString("ko-KR")} →
                현재 ₩{Math.round(product.costAlert.newCost).toLocaleString("ko-KR")} (
                {product.costAlert.direction === "up" ? "+" : ""}
                {product.costAlert.changePercent.toFixed(1)}%).
                {" "}판매가를 조정하거나 [확인]으로 알림을 닫을 수 있습니다.
                <div className="mt-3">
                  <ProductCostCauseCard productId={product.id} />
                </div>
              </JmAlert>
            )}

            <GroupHeader id="grp-overview" label="개요" />
            <ProductKpiCards product={product} cardFeeRate={cardFeeRate} />
            {!isOptionParent && (
              <>
                <ProductCostBreakdownCard
                  product={product}
                  onEdit={
                    product.isSet || product.productType === "ASSEMBLED"
                      ? () => setSetComponentsEditOpen(true)
                      : undefined
                  }
                  // 일반 ASSEMBLED 상품(canonical 아님) 에 [조립실적 추가] 노출.
                  // canonical 은 ProductVariantsCard 의 자체 버튼이 우선이라 중복 안 띄움.
                  onAddAssembly={
                    product.productType === "ASSEMBLED" && !product.isCanonical
                      ? () => setAssemblyRegisterOpen(true)
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
              </>
            )}
            {product.isCanonical && (
              <ProductVariantsCard
                productId={product.id}
                taxType={product.taxType}
                variants={product.variants ?? []}
                parentSetComponentsEmpty={
                  (product.setComponents ?? []).length === 0
                }
              />
            )}
            <ProductInfoCard
              product={product}
              onEdit={() => setInfoEditOpen(true)}
              onToggleCatalogHidden={(hidden) =>
                toggleCatalogMutation.mutate(hidden)
              }
              catalogToggleBusy={toggleCatalogMutation.isPending}
            />
            <ProductDescriptionBlock
              product={product}
              onSaveDescription={(description) =>
                saveSingleField({ description: description || null })
              }
              onSaveMemo={(memo) => saveSingleField({ memo: memo || null })}
            />

            {/* 가격·비용 — OPTION_PARENT 는 자체 가격이 없어 숨김 */}
            {!isOptionParent && (
              <>
                <GroupHeader id="grp-pricing" label="가격·비용" />
                <ProductSection
                  title="전사 공통 판매비용"
                  description="모든 채널에 공통으로 적용되는 비용"
                  noPadding
                  actions={<EditButton onClick={() => setCostsEditOpen(true)} />}
                >
                  <ProductSellingCostsTable costs={globalCosts} />
                </ProductSection>

                <ProductSection
                  title="채널별 가격 · 비용 · 마진"
                  description="채널 전용 비용 상세는 우측 (i) 버튼"
                  noPadding
                  actions={
                    <EditButton onClick={() => setChannelEditOpen(true)} />
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
              </>
            )}

            <GroupHeader id="grp-catalog" label="구성·옵션" />
            <ProductSection
              title="상세 스펙"
              description="필터·검색용 구조화된 스펙 정보"
              noPadding
              actions={<EditButton onClick={() => setSpecsEditOpen(true)} />}
            >
              <ProductSpecsTable values={product.specValues ?? []} />
            </ProductSection>

            <ProductSection
              title={isOptionParent ? "고객 옵션 (대표상품 핵심)" : "고객 옵션"}
              description="고객이 카탈로그·POS 에서 선택하는 옵션 (변형상품과 분리). 옵션값마다 단순 텍스트 / 다른 Product 매핑 / 매장 variant 매핑 중 선택"
              noPadding
              actions={<EditButton onClick={() => setOptionsEditOpen(true)} />}
            >
              {isOptionParent && (product.productOptions ?? []).length === 0 && (
                <div className="m-3 rounded-md border border-[var(--jm-danger-bg)] bg-[var(--jm-danger-bg)] px-3 py-2 text-jm-xs text-[var(--jm-danger-fg)]">
                  연결된 단품이 없어 카탈로그·POS 에서 선택할 수 없습니다. [편집]
                  에서 옵션값을 단품에 연결하세요.
                </div>
              )}
              <ProductOptionsTable options={product.productOptions ?? []} />
            </ProductSection>

            <ProductSection
              title="추가구매 추천"
              description="이 상품과 함께 사면 좋은 단독 카탈로그 상품들. 카트 추가 시 손님에게 추천 노출되고, 선택 시 자식 OrderItem(ADDON) 으로 함께 결제됨"
              noPadding
              actions={<EditButton onClick={() => setBundlesEditOpen(true)} />}
            >
              <ProductBundlesTable bundles={product.bundles ?? []} />
            </ProductSection>

            <ProductSection
              title="상위 상품"
              description="이 상품을 구성품으로 쓰는 세트·조립 상품 (역방향 구성)"
              noPadding
            >
              <ProductParentsTable parents={product.parentProducts ?? []} />
            </ProductSection>

            {/* 벌크 — 세트/조립/변형/옵션대표가 아닌 단품만 (구성품은 위 원가 분해 카드로 통합) */}
            {!product.isSet &&
              product.productType !== "ASSEMBLED" &&
              !product.isCanonical &&
              !isOptionParent && <ProductBulkCard product={product} />}

            {/* 공급·재고 — OPTION_PARENT 는 자체 공급/재고가 없어 숨김 */}
            {!isOptionParent && (
              <>
                <GroupHeader id="grp-supply" label="공급·재고" />
                <ProductSection
                  title="공급자 매핑"
                  description="이 판매상품으로 환산되는 공급자 상품"
                  noPadding
                  actions={
                    <EditButton onClick={() => setMappingEditOpen(true)} />
                  }
                >
                  <ProductMappingsTable mappings={mappings} />
                </ProductSection>

                {mappings.map((m) => (
                  <div key={`shipping-${m.id}`} className="space-y-2">
                    <div className="px-1 text-jm-xs text-[var(--jm-text-muted)]">
                      {m.supplierProduct.name}
                      {m.supplierProduct.supplierCode
                        ? ` · ${m.supplierProduct.supplierCode}`
                        : ""}
                    </div>
                    <ShippingHistoryCard
                      supplierProductId={m.supplierProduct.id}
                    />
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
              </>
            )}

            <GroupHeader id="grp-media" label="미디어" />
            <ProductSection
              title="이미지 · 영상"
              description="POS 카탈로그·판매 화면에 함께 노출됩니다"
              noPadding
            >
              <ProductMediaManager
                productId={product.id}
                imageUrl={product.imageUrl}
                onImageUrlChange={() =>
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.products.detail(id),
                  })
                }
              />
            </ProductSection>

            <GroupHeader id="grp-history" label="이력" />
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

            {/* 가격 변경 이력 — 상품 정가/판매가 수정 시 자동 기록 */}
            <ProductSection
              title="가격 변경 이력"
              description="정가·판매가가 바뀐 시점, 변경자, 사유까지 추적합니다 (최근 100건)"
              noPadding
            >
              <ProductPriceHistoryCard productId={product.id} />
            </ProductSection>

            {/* 실판매 단가 이력 — 실제 판매된 OrderItem 의 정가/실판매가/할인율 분포 */}
            <ProductSection
              title="실판매 단가 이력"
              description="POS·주문에서 실제 결제된 단가 분포 (최근 100건). 정가와 다르게 할인 판매된 케이스를 한눈에 확인"
              noPadding
            >
              <ProductSalesPriceHistoryCard productId={product.id} />
            </ProductSection>

            <ProductSection
              title="부속 사용 수리 이력"
              description="이 상품이 수리 부속으로 소진된 내역 (최근 50건)"
              noPadding
            >
              <ProductRepairUsageTable usages={product.repairUsages ?? []} />
            </ProductSection>
          </div>
        </div>
      </div>

      <JmDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>상품을 비활성 처리할까요?</JmDialogTitle>
            <JmDialogDescription>
              상품 데이터는 유지되며, 목록에서만 숨겨집니다 (매핑·비용·채널가격·이력
              모두 보존). 필요 시 복구 가능합니다.
            </JmDialogDescription>
          </JmDialogHeader>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              variant="danger"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <JmSpinner size="sm" tone="inverted" />
              )}
              비활성
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

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
      <ProductOptionsEditSheet
        open={optionsEditOpen}
        onOpenChange={setOptionsEditOpen}
        product={product}
      />
      <ProductBundlesEditSheet
        open={bundlesEditOpen}
        onOpenChange={setBundlesEditOpen}
        product={product}
      />
      <ProductSetComponentsEditSheet
        open={setComponentsEditOpen}
        onOpenChange={setSetComponentsEditOpen}
        product={product}
      />
      <AssemblyRegisterSheet
        open={assemblyRegisterOpen}
        onOpenChange={setAssemblyRegisterOpen}
        initialProductId={product.id}
        showProductPicker={false}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: queryKeys.products.all })
        }
      />
      <ProductMergeDialog
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
        sourceProductId={product.id}
        sourceProductName={product.name}
        onMerged={(targetId) => router.push(`/products/${targetId}`)}
      />
    </ProductsThemeScope>
  );
}
