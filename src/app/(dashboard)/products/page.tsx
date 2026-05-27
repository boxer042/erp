"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Coins,
  Link2,
  Package,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmFormField,
  JmIconButton,
  JmInput,
  JmPill,
  JmSearchInput,
  JmSelect,
  JmSkeleton,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
  JmTooltip,
  JmTooltipProvider,
} from "@/jm";
import { MappingSheet } from "@/components/mapping-sheet";
import { InlineTextEdit } from "@/components/product/edit/inline-text-edit";
import { ProductsThemeScope } from "./_theme-scope";

interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  children: { id: string; name: string }[];
}

interface ProductMapping {
  id: string;
  conversionRate: string;
  supplierProduct: {
    id: string;
    name: string;
    unitPrice: string;
    isProvisional: boolean;
    supplier: { name: string };
  };
}

interface CostAlert {
  direction: "up" | "down";
  oldCost: number;
  newCost: number;
  changeAmount: number;
  changePercent: number;
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  spec: string | null;
  unitOfMeasure: string;
  productType: string;
  listPrice: string;
  sellingPrice: string;
  taxType: string;
  taxRate: string;
  isSet: boolean;
  isBulk?: boolean;
  isCanonical: boolean;
  canonicalProductId: string | null;
  canonicalProduct: { id: string; name: string; sku: string } | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    inventory: { quantity: string } | null;
  }>;
  isActive: boolean;
  autoMapped: boolean;
  trackable: boolean;
  unitCost: number | null;
  inventory: { quantity: string; safetyStock: string } | null;
  productMappings: ProductMapping[];
  costAlert: CostAlert | null;
}

function CostAlertBadge({ alert }: { alert: CostAlert }) {
  const isUp = alert.direction === "up";
  const label = isUp ? "원가↑" : "원가↓";
  const sign = isUp ? "+" : "";
  const tooltip = `₩${Math.round(alert.oldCost).toLocaleString("ko-KR")} → ₩${Math.round(alert.newCost).toLocaleString("ko-KR")} (${sign}${alert.changePercent.toFixed(1)}%)`;
  return (
    <JmTooltip content={tooltip}>
      <span
        className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
        style={{
          backgroundColor: isUp ? "var(--jm-danger-bg)" : "var(--jm-info-bg)",
          color: isUp ? "var(--jm-danger-fg)" : "var(--jm-info-fg)",
        }}
        aria-label={tooltip}
      >
        {label}
      </span>
    </JmTooltip>
  );
}

function ProductTypeBadge({ type }: { type: string }) {
  switch (type) {
    case "PARTS":
      return (
        <JmBadge variant="outline" size="sm">
          부속
        </JmBadge>
      );
    case "SET":
      return (
        <JmBadge variant="info" size="sm">
          세트
        </JmBadge>
      );
    case "ASSEMBLED":
      return (
        <JmBadge variant="accent" size="sm">
          조립
        </JmBadge>
      );
    default:
      return (
        <JmBadge variant="default" size="sm">
          완제품
        </JmBadge>
      );
  }
}

function calcBreakdown(netPrice: number, taxRate: number, taxType: string) {
  if (taxType !== "TAXABLE" || taxRate === 0) {
    return { supply: netPrice, tax: 0, total: netPrice };
  }
  // 정수 단가는 반올림, 소수 단가(벌크)는 정확한 값 유지
  const rawTax = netPrice * taxRate;
  const tax = Number.isInteger(netPrice) ? Math.round(rawTax) : rawTax;
  return { supply: netPrice, tax, total: netPrice + tax };
}

const isProductLowStock = (p: Product) => {
  const q = p.inventory ? parseFloat(p.inventory.quantity) : 0;
  const s = p.inventory ? parseFloat(p.inventory.safetyStock) : 0;
  return s > 0 && q < s;
};

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

// ─────────────────────────────────────────────
function ProductRowSkeleton() {
  return (
    <JmTableRow className="hover:bg-transparent">
      <JmTableCell>
        <JmSkeleton className="h-4 w-44" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-20" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-24" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-8" />
      </JmTableCell>
      {Array.from({ length: 5 }).map((_, i) => (
        <JmTableCell key={i}>
          <div className="flex justify-end">
            <JmSkeleton className="h-4 w-16" />
          </div>
        </JmTableCell>
      ))}
      <JmTableCell>
        <JmSkeleton className="h-5 w-12 rounded-full" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-6" />
      </JmTableCell>
      <JmTableCell>
        <div className="flex justify-end">
          <JmSkeleton className="h-8 w-8 rounded-md" />
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}

// ─────────────────────────────────────────────
export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const [mappingSheetOpen, setMappingSheetOpen] = useState(false);
  const [mappingTarget, setMappingTarget] = useState<{
    id: string;
    name: string;
    unit: string;
  } | null>(null);

  const [showLowStock, setShowLowStock] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showAutoMapped, setShowAutoMapped] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [safetyTarget, setSafetyTarget] = useState<Product | null>(null);
  const [safetyValue, setSafetyValue] = useState("");

  const [serialTarget, setSerialTarget] = useState<Product | null>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
  });
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({
      search: appliedSearch,
      categoryId: selectedCategoryId,
      showBulk,
      showAutoMapped,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ search: appliedSearch });
      if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
      // 토글 ON: 벌크 SKU만, OFF(기본): 일반 SKU만
      if (showBulk) params.set("isBulk", "true");
      if (showAutoMapped) params.set("autoMapped", "1");
      // ERP 대시보드는 catalogHidden 상품도 모두 관리 가능해야 함 (옵션 swap 대상 SKU 등)
      params.set("includeHidden", "1");
      return apiGet<Product[]>(`/api/products?${params.toString()}`);
    },
  });

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );
  const isPending = productsQuery.isPending;
  const isError = productsQuery.isError;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

  // 변형(variant)을 canonical 그룹에서 분리 — 상위(topLevel)만 행으로 렌더
  const { topLevel, variantsByCanonical } = useMemo(() => {
    const byCanonical = new Map<string, Product[]>();
    const top: Product[] = [];
    for (const p of products) {
      if (p.canonicalProductId) {
        const list = byCanonical.get(p.canonicalProductId) ?? [];
        list.push(p);
        byCanonical.set(p.canonicalProductId, list);
      } else {
        top.push(p);
      }
    }
    return { topLevel: top, variantsByCanonical: byCanonical };
  }, [products]);

  const rowIsLowStock = useMemo(
    () => (p: Product) =>
      p.isCanonical
        ? (variantsByCanonical.get(p.id) ?? []).some(isProductLowStock)
        : isProductLowStock(p),
    [variantsByCanonical],
  );

  // KPI — 로드된 데이터 기준
  const stats = useMemo(() => {
    let lowStock = 0;
    let priceUnset = 0;
    for (const p of topLevel) {
      if (rowIsLowStock(p)) lowStock += 1;
      if (!p.autoMapped && parseFloat(p.sellingPrice || "0") === 0)
        priceUnset += 1;
    }
    let assetValue = 0;
    for (const p of products) {
      if (p.unitCost != null && p.inventory) {
        assetValue += p.unitCost * parseFloat(p.inventory.quantity);
      }
    }
    return {
      total: topLevel.length,
      lowStock,
      priceUnset,
      assetValue: Math.round(assetValue),
    };
  }, [topLevel, products, rowIsLowStock]);

  const categoryOptions = useMemo(() => {
    const opts = [{ value: "", label: "전체 카테고리" }];
    for (const cat of categories) {
      if (cat.children.length > 0) {
        for (const ch of cat.children)
          opts.push({ value: ch.id, label: `${cat.name} › ${ch.name}` });
      } else {
        opts.push({ value: cat.id, label: cat.name });
      }
    }
    return opts;
  }, [categories]);

  const rows = useMemo(
    () => (showLowStock ? topLevel.filter(rowIsLowStock) : topLevel),
    [topLevel, showLowStock, rowIsLowStock],
  );

  const serialMutation = useMutation({
    mutationFn: (vars: { id: string; trackable: boolean }) =>
      apiMutate(`/api/products/${vars.id}`, "PATCH", {
        trackable: vars.trackable,
      }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.trackable
          ? "시리얼 발번이 켜졌습니다"
          : "시리얼 발번이 꺼졌습니다",
      );
      setSerialTarget(null);
      invalidate();
    },
    onError: () => toast.error("설정 변경에 실패했습니다"),
  });

  const safetyMutation = useMutation({
    mutationFn: (vars: { productId: string; safetyStock: string }) =>
      apiMutate("/api/inventory/safety", "PUT", vars),
    onSuccess: () => {
      toast.success("안전재고가 설정되었습니다");
      setSafetyTarget(null);
      invalidate();
    },
    onError: () => toast.error("설정 실패"),
  });

  const filtersActive =
    !!appliedSearch ||
    !!selectedCategoryId ||
    showLowStock ||
    showBulk ||
    showAutoMapped;

  return (
    <ProductsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="전체 상품"
                value={isPending ? "—" : stats.total.toLocaleString("ko-KR")}
                icon={<Package className="size-4" />}
                hint={isPending ? "" : "변형 제외 기준"}
                size="sm"
              />
              <JmStat
                label="낮은 재고"
                value={
                  isPending ? "—" : stats.lowStock.toLocaleString("ko-KR")
                }
                icon={<TriangleAlert className="size-4" />}
                hint={isPending ? "" : "안전재고 미달"}
                positiveIsGood={false}
                size="sm"
              />
              <JmStat
                label="판매가 미설정"
                value={
                  isPending ? "—" : stats.priceUnset.toLocaleString("ko-KR")
                }
                icon={<Coins className="size-4" />}
                hint={isPending ? "" : "판매가 0원"}
                positiveIsGood={false}
                size="sm"
              />
              <JmStat
                label="재고 자산"
                value={isPending ? "—" : won(stats.assetValue)}
                icon={<Boxes className="size-4" />}
                hint={isPending ? "" : "원가 × 재고"}
                size="sm"
              />
            </div>

            {/* 메인 카드 */}
            <JmCard className="overflow-hidden p-0">
              <JmTableToolbar>
                <JmTableToolbarSearch>
                  <JmSearchInput
                    size="sm"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onClear={() => {
                      setSearch("");
                      setAppliedSearch("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        setAppliedSearch(search);
                      }
                    }}
                    placeholder="상품명 또는 SKU"
                  />
                </JmTableToolbarSearch>
                <JmTableToolbarFilters>
                  {categoryOptions.length > 1 && (
                    <JmSelect
                      size="sm"
                      variant="pill"
                      label="카테고리"
                      value={selectedCategoryId}
                      onChange={(v) => setSelectedCategoryId(v)}
                      options={categoryOptions}
                    />
                  )}
                  <JmPill
                    size="sm"
                    active={showLowStock}
                    onClick={() => setShowLowStock((v) => !v)}
                  >
                    낮은재고만
                  </JmPill>
                  <JmPill
                    size="sm"
                    active={showBulk}
                    onClick={() => setShowBulk((v) => !v)}
                  >
                    벌크만
                  </JmPill>
                  <JmPill
                    size="sm"
                    active={showAutoMapped}
                    onClick={() => setShowAutoMapped((v) => !v)}
                  >
                    자동생성만
                  </JmPill>
                </JmTableToolbarFilters>
                <JmTableToolbarActions>
                  <JmIconButton
                    variant="ghost"
                    size="sm"
                    aria-label="새로고침"
                    onClick={() => productsQuery.refetch()}
                    disabled={productsQuery.isFetching}
                  >
                    {productsQuery.isFetching ? (
                      <JmSpinner size="sm" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </JmIconButton>
                  <JmButton
                    size="sm"
                    onClick={() => router.push("/products/new")}
                  >
                    <Plus className="size-4" />
                    상품 등록
                  </JmButton>
                </JmTableToolbarActions>
              </JmTableToolbar>

              <JmTable className="min-w-[1360px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>상품명</JmTableHead>
                    <JmTableHead className="w-[120px]">SKU</JmTableHead>
                    <JmTableHead className="w-[140px]">규격</JmTableHead>
                    <JmTableHead className="w-[70px]">단위</JmTableHead>
                    <JmTableHead className="w-[110px] text-right">
                      공급가액
                    </JmTableHead>
                    <JmTableHead className="w-[90px] text-right">
                      세액
                    </JmTableHead>
                    <JmTableHead className="w-[120px] text-right">
                      판매가
                    </JmTableHead>
                    <JmTableHead className="w-[90px] text-right">
                      재고
                    </JmTableHead>
                    <JmTableHead className="w-[90px] text-right">
                      안전재고
                    </JmTableHead>
                    <JmTableHead className="w-[130px]">유형</JmTableHead>
                    <JmTableHead className="w-[80px]">매핑</JmTableHead>
                    <JmTableHead className="w-[120px] text-center">
                      시리얼 발번
                    </JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {isPending ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <ProductRowSkeleton key={i} />
                    ))
                  ) : isError ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell
                        colSpan={12}
                        className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                      >
                        상품 목록을 불러오지 못했습니다
                      </JmTableCell>
                    </JmTableRow>
                  ) : rows.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={12} className="py-12">
                        <JmEmpty
                          icon={<Package className="size-8" />}
                          title={
                            showLowStock
                              ? "낮은재고 상품이 없습니다"
                              : filtersActive
                                ? "조건에 맞는 상품이 없습니다"
                                : "등록된 상품이 없습니다"
                          }
                          description={
                            filtersActive
                              ? "검색어나 필터를 바꿔보세요"
                              : "첫 판매상품을 등록해 재고·매핑·판매가를 관리하세요"
                          }
                          action={
                            !filtersActive ? (
                              <JmButton
                                size="sm"
                                onClick={() => router.push("/products/new")}
                              >
                                <Plus className="size-4" />
                                상품 등록
                              </JmButton>
                            ) : null
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    rows.map((product) => {
                      const bd = calcBreakdown(
                        parseFloat(product.sellingPrice),
                        parseFloat(product.taxRate || "0.1"),
                        product.taxType || "TAXABLE",
                      );
                      const qty = product.inventory
                        ? parseFloat(product.inventory.quantity)
                        : 0;
                      const safety = product.inventory
                        ? parseFloat(product.inventory.safetyStock)
                        : 0;
                      const isLow = safety > 0 && qty < safety;
                      const isCanonical = product.isCanonical;
                      const variantList =
                        variantsByCanonical.get(product.id) ?? [];
                      const variantStockSum = isCanonical
                        ? variantList.reduce(
                            (s, v) =>
                              s +
                              (v.inventory
                                ? parseFloat(v.inventory.quantity)
                                : 0),
                            0,
                          )
                        : 0;

                      return (
                        <JmTableRow key={product.id}>
                          <JmTableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {product.costAlert && (
                                <CostAlertBadge alert={product.costAlert} />
                              )}
                              <InlineTextEdit
                                value={product.name}
                                onSave={async (next) => {
                                  await apiMutate(
                                    `/api/products/${product.id}`,
                                    "PATCH",
                                    { name: next },
                                  );
                                }}
                                display={
                                  <Link
                                    href={`/products/${product.id}`}
                                    className="font-medium text-[var(--jm-text)] hover:text-[var(--jm-action)] hover:underline"
                                  >
                                    {product.name}
                                  </Link>
                                }
                              />
                              {isCanonical && (
                                <JmBadge variant="success" size="sm">
                                  변형대표
                                </JmBadge>
                              )}
                              {product.autoMapped && (
                                <JmBadge variant="info" size="sm">
                                  자동
                                </JmBadge>
                              )}
                            </div>
                          </JmTableCell>
                          <JmTableCell>
                            <span className="font-[family-name:var(--jm-font-mono)] text-[12px] text-[var(--jm-text-muted)]">
                              {product.sku}
                            </span>
                          </JmTableCell>
                          <JmTableCell className="truncate text-[13px] text-[var(--jm-text-muted)]">
                            {product.spec || "—"}
                          </JmTableCell>
                          <JmTableCell className="text-[13px] text-[var(--jm-text-muted)]">
                            {product.unitOfMeasure}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            {won(bd.supply)}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            {won(bd.tax)}
                          </JmTableCell>
                          <JmTableCell className="text-right">
                            {bd.total === 0 ? (
                              product.autoMapped ? (
                                <JmBadge variant="outline" size="sm">
                                  담당자 문의
                                </JmBadge>
                              ) : (
                                <JmBadge variant="warning" size="sm">
                                  미설정
                                </JmBadge>
                              )
                            ) : (
                              <span className="font-medium tabular-nums text-[var(--jm-text)]">
                                {won(bd.total)}
                              </span>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right">
                            {isCanonical ? (
                              <span
                                className="tabular-nums text-[var(--jm-text-muted)]"
                                title="변형 재고 합산"
                              >
                                {variantStockSum.toLocaleString("ko-KR")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className={`cursor-pointer tabular-nums hover:text-[var(--jm-action)] hover:underline ${
                                  isLow
                                    ? "font-medium text-[var(--jm-danger-fg)]"
                                    : "text-[var(--jm-text)]"
                                }`}
                                onClick={() => {
                                  setSafetyTarget(product);
                                  setSafetyValue(
                                    product.inventory?.safetyStock ?? "1",
                                  );
                                }}
                                title="안전재고 설정"
                              >
                                {product.inventory
                                  ? qty.toLocaleString("ko-KR")
                                  : "-"}
                              </button>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            {product.inventory
                              ? safety.toLocaleString("ko-KR")
                              : "-"}
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex items-center gap-1">
                              <ProductTypeBadge type={product.productType} />
                              {product.isBulk && (
                                <JmBadge variant="default" size="sm">
                                  벌크
                                </JmBadge>
                              )}
                            </div>
                          </JmTableCell>
                          <JmTableCell>
                            <button
                              type="button"
                              className="flex cursor-pointer items-center gap-1 text-[13px] hover:underline"
                              onClick={() => {
                                setMappingTarget({
                                  id: product.id,
                                  name: product.name,
                                  unit: product.unitOfMeasure,
                                });
                                setMappingSheetOpen(true);
                              }}
                            >
                              {product.productMappings.length > 0 ? (
                                <>
                                  <span className="font-medium text-[var(--jm-action)]">
                                    {product.productMappings.length}
                                  </span>
                                  {product.productMappings.some(
                                    (m) => m.supplierProduct.isProvisional,
                                  ) && (
                                    <JmBadge variant="outline" size="sm">
                                      임시
                                    </JmBadge>
                                  )}
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[var(--jm-text-subtle)]">
                                  <Link2 className="size-3.5" />
                                  연결
                                </span>
                              )}
                            </button>
                          </JmTableCell>
                          <JmTableCell>
                            <div className="flex justify-center">
                              <JmTooltip content="클릭해 시리얼 발번 설정">
                                <button
                                  type="button"
                                  onClick={() => setSerialTarget(product)}
                                  className="cursor-pointer"
                                  aria-label="시리얼 발번 설정"
                                >
                                  {product.trackable ? (
                                    <JmBadge variant="success" size="sm">
                                      발번 ON
                                    </JmBadge>
                                  ) : (
                                    <JmBadge variant="default" size="sm">
                                      발번 OFF
                                    </JmBadge>
                                  )}
                                </button>
                              </JmTooltip>
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      );
                    })
                  )}
                </JmTableBody>
              </JmTable>
            </JmCard>
          </div>
        </div>

        {/* 매핑 Sheet */}
        {mappingTarget && (
          <MappingSheet
            open={mappingSheetOpen}
            onOpenChange={setMappingSheetOpen}
            mode="product-to-supplier"
            productId={mappingTarget.id}
            productName={mappingTarget.name}
            productUnit={mappingTarget.unit}
            onMappingChange={invalidate}
          />
        )}

        {/* 안전재고 설정 Dialog */}
        <JmDialog
          open={!!safetyTarget}
          onOpenChange={(o) => !o && setSafetyTarget(null)}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>안전재고 설정</JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              {safetyTarget && (
                <form
                  id="safety-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    safetyMutation.mutate({
                      productId: safetyTarget.id,
                      safetyStock: safetyValue,
                    });
                  }}
                >
                  <p className="mb-3 text-jm-sm text-[var(--jm-text-muted)]">
                    <span className="font-semibold text-[var(--jm-text)]">
                      {safetyTarget.name}
                    </span>{" "}
                    (SKU {safetyTarget.sku})
                  </p>
                  <JmFormField label="안전재고 수량">
                    <JmInput
                      type="text"
                      inputMode="decimal"
                      value={safetyValue}
                      onChange={(e) => setSafetyValue(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      autoFocus
                    />
                  </JmFormField>
                </form>
              )}
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                variant="ghost"
                onClick={() => setSafetyTarget(null)}
                disabled={safetyMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                type="submit"
                form="safety-form"
                variant="cta"
                disabled={safetyMutation.isPending}
              >
                {safetyMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                저장
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>

        {/* 시리얼 발번 설정 Dialog */}
        <JmDialog
          open={!!serialTarget}
          onOpenChange={(o) => !o && setSerialTarget(null)}
        >
          <JmDialogContent size="sm">
            <JmDialogHeader>
              <JmDialogTitle>
                시리얼 발번 {serialTarget?.trackable ? "끄기" : "켜기"}
              </JmDialogTitle>
            </JmDialogHeader>
            <JmDialogBody>
              <p className="text-jm-sm text-[var(--jm-text)]">
                <span className="font-semibold">{serialTarget?.name}</span>
              </p>
              {serialTarget?.trackable ? (
                <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                  발번을 끄면 이 상품을 판매·수리할 때 시리얼 라벨을 더 이상
                  발번하지 않습니다. 이미 발번된 시리얼 라벨과 보증·수리 이력은
                  그대로 유지됩니다.
                </p>
              ) : (
                <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
                  발번을 켜면 이 상품을 판매·수리할 때 시리얼 라벨(QR)을 발번할
                  수 있습니다. 제품별 보증 기간·수리 이력 추적과 손님이 QR로
                  직접 조회하는 페이지 연결에 사용됩니다.
                </p>
              )}
            </JmDialogBody>
            <JmDialogFooter>
              <JmButton
                variant="outline"
                onClick={() => setSerialTarget(null)}
                disabled={serialMutation.isPending}
              >
                취소
              </JmButton>
              <JmButton
                variant="cta"
                onClick={() =>
                  serialTarget &&
                  serialMutation.mutate({
                    id: serialTarget.id,
                    trackable: !serialTarget.trackable,
                  })
                }
                disabled={serialMutation.isPending}
              >
                {serialMutation.isPending && (
                  <JmSpinner size="sm" tone="inverted" />
                )}
                {serialTarget?.trackable ? "발번 끄기" : "발번 켜기"}
              </JmButton>
            </JmDialogFooter>
          </JmDialogContent>
        </JmDialog>
      </JmTooltipProvider>
    </ProductsThemeScope>
  );
}
