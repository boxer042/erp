"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Archive, CheckCircle2, FlaskConical, Link2, Package, Plus, RefreshCw, Sparkles } from "lucide-react";
import {
  JmBadge,
  JmButton,
  JmCard,
  JmCombobox,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmEmpty,
  JmIconButton,
  JmPill,
  JmSearchInput,
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
import { SupplierProductsThemeScope } from "./_theme-scope";
import { SupplierProductsRowSkeleton } from "./_parts";

interface MappingInfo {
  id: string;
  conversionRate: string;
  product: { id: string; name: string; sku: string; sellingPrice: string };
}

interface IncomingCostSummary {
  costType: "FIXED" | "PERCENTAGE";
  value: string;
  isTaxable: boolean;
}

interface SupplierProduct {
  id: string;
  supplierId: string;
  name: string;
  spec: string | null;
  supplierCode: string | null;
  unitPrice: string;
  isTaxable: boolean;
  isProvisional: boolean;
  isActive: boolean;
  unitOfMeasure: string;
  source: string;
  supplier: { name: string };
  productMappings: MappingInfo[];
  _count: { incomingItems: number };
  incomingCosts: IncomingCostSummary[];
  avgShippingCost: number | null;
  priceHistory: { oldPrice: string; newPrice: string }[];
}

interface Supplier {
  id: string;
  name: string;
}

type MappingFilter = "all" | "mapped" | "unmapped";
const MAPPING_FILTER_LABELS: Record<MappingFilter, string> = {
  all: "전체 상태",
  mapped: "매핑됨",
  unmapped: "미매핑",
};

type StatusFilter = "active" | "inactive" | "all";

export default function SupplierProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [provisionalOnly, setProvisionalOnly] = useState(false);

  // 매핑 선택 다이얼로그
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceTarget, setChoiceTarget] = useState<{ id: string; supplierId: string; name: string; unit: string } | null>(null);

  // 매핑 시트
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [defaultProductId, setDefaultProductId] = useState("");

  // 자동매핑 일괄 실행 확인 다이얼로그
  const [autoMapConfirmOpen, setAutoMapConfirmOpen] = useState(false);

  // 비활성화 확인 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<SupplierProduct | null>(null);

  const itemsQuery = useQuery({
    queryKey: queryKeys.supplierProducts.list({
      supplierId: selectedSupplier,
      search: searchQuery,
      includeInactive: statusFilter !== "active",
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedSupplier !== "all") params.set("supplierId", selectedSupplier);
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "active") params.set("includeInactive", "1");
      return apiGet<SupplierProduct[]>(`/api/supplier-products?${params}`);
    },
  });
  const items = itemsQuery.data ?? [];
  const loading = itemsQuery.isPending;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const supplierItems = useMemo(
    () => [
      { id: "all", label: "전체 거래처" },
      ...suppliers.map((s) => ({ id: s.id, label: s.name })),
    ],
    [suppliers],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 상태 필터
      if (statusFilter === "active" && !item.isActive) return false;
      if (statusFilter === "inactive" && item.isActive) return false;
      // 매핑 필터
      if (mappingFilter === "mapped" && item.productMappings.length === 0) return false;
      if (mappingFilter === "unmapped" && item.productMappings.length > 0) return false;
      // 임시 필터
      if (provisionalOnly && !item.isProvisional) return false;
      return true;
    });
  }, [items, mappingFilter, statusFilter, provisionalOnly]);

  // 매핑 필터 카운트 — 상태 필터 적용 후 기준
  const baseForMappingCount = useMemo(
    () =>
      items.filter((i) => {
        if (statusFilter === "active") return i.isActive;
        if (statusFilter === "inactive") return !i.isActive;
        return true;
      }),
    [items, statusFilter],
  );

  const counts: Record<MappingFilter, number> = useMemo(
    () => ({
      all: baseForMappingCount.length,
      mapped: baseForMappingCount.filter((i) => i.productMappings.length > 0).length,
      unmapped: baseForMappingCount.filter((i) => i.productMappings.length === 0).length,
    }),
    [baseForMappingCount],
  );

  // KPI 통계 — 활성 기준 (다른 jm 페이지 컨벤션)
  const stats = useMemo(() => {
    const active = items.filter((i) => i.isActive);
    const mapped = active.filter((i) => i.productMappings.length > 0).length;
    const unmapped = active.length - mapped;
    const provisional = active.filter((i) => i.isProvisional).length;
    return { total: active.length, mapped, unmapped, provisional };
  }, [items]);

  const unmappedCount = stats.unmapped;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/supplier-products/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("거래처 상품이 비활성화되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "비활성화에 실패했습니다");
    },
  });

  const autoMapMutation = useMutation({
    mutationFn: () =>
      apiMutate<{ total: number; success: number; failed: number; errors: { id: string; name: string; message: string }[] }>(
        "/api/supplier-products/auto-map",
        "POST",
      ),
    onSuccess: (res) => {
      setAutoMapConfirmOpen(false);
      if (res.total === 0) {
        toast.success("미매핑 상품이 없습니다");
      } else if (res.failed === 0) {
        toast.success(`${res.success}건 자동매핑 완료`);
      } else {
        toast.warning(`성공 ${res.success}건 / 실패 ${res.failed}건 — 실패 항목은 콘솔 확인`);
        console.warn("[auto-map] 실패 목록:", res.errors);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierProducts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "자동매핑 실패");
    },
  });

  const openMappingChoice = (sp: SupplierProduct) => {
    setChoiceTarget({ id: sp.id, supplierId: sp.supplierId, name: sp.name, unit: sp.unitOfMeasure });
    setChoiceOpen(true);
  };

  const openMapping = (sp?: { id: string; supplierId: string; name: string; unit: string }, productId = "") => {
    const target = sp ?? choiceTarget;
    if (!target) return;
    setDialogTarget(target);
    setDefaultProductId(productId);
    setChoiceOpen(false);
    setDialogOpen(true);
  };

  return (
    <SupplierProductsThemeScope>
      <JmTooltipProvider>
        <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
          <div className="flex w-full flex-col gap-6 p-4">
            {/* KPI */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <JmStat
                label="전체 거래처상품"
                value={loading ? "—" : stats.total.toLocaleString("ko-KR")}
                icon={<Package className="size-4" />}
                hint={loading ? "" : "활성 기준"}
                size="sm"
              />
              <JmStat
                label="매핑됨"
                value={loading ? "—" : stats.mapped.toLocaleString("ko-KR")}
                icon={<CheckCircle2 className="size-4" />}
                hint={
                  loading || stats.total === 0
                    ? ""
                    : `${Math.round((stats.mapped / stats.total) * 100)}%`
                }
                size="sm"
              />
              <JmStat
                label="미매핑"
                value={loading ? "—" : stats.unmapped.toLocaleString("ko-KR")}
                icon={<AlertTriangle className="size-4" />}
                hint={
                  loading || stats.total === 0
                    ? ""
                    : `${Math.round((stats.unmapped / stats.total) * 100)}%`
                }
                size="sm"
              />
              <JmStat
                label="임시"
                value={loading ? "—" : stats.provisional.toLocaleString("ko-KR")}
                icon={<FlaskConical className="size-4" />}
                hint={loading ? "" : "정식 정보 채워야 함"}
                size="sm"
              />
            </div>

            <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarSearch>
                <JmSearchInput
                  size="sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClear={() => {
                    setSearch("");
                    setSearchQuery("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      setSearchQuery(search);
                    }
                  }}
                  placeholder="품명 / 품번 검색..."
                />
              </JmTableToolbarSearch>
              <JmTableToolbarFilters>
                <JmCombobox
                  size="sm"
                  items={supplierItems}
                  value={selectedSupplier}
                  onChange={(item) => setSelectedSupplier(item.id)}
                  placeholder="거래처 선택"
                  searchPlaceholder="거래처 검색..."
                  className="w-[180px]"
                />
                {(Object.keys(MAPPING_FILTER_LABELS) as MappingFilter[]).map((m) => (
                  <JmPill
                    key={m}
                    size="sm"
                    active={mappingFilter === m}
                    onClick={() => setMappingFilter(m)}
                  >
                    {MAPPING_FILTER_LABELS[m]}
                    <span className="ml-1 tabular-nums opacity-70">
                      {counts[m]}
                    </span>
                  </JmPill>
                ))}
                <span className="mx-1 h-4 w-px bg-[var(--jm-border)]" />
                <JmPill size="sm" active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
                  활성
                </JmPill>
                <JmPill size="sm" active={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")}>
                  비활성
                </JmPill>
                <JmPill size="sm" active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
                  모두
                </JmPill>
                <span className="mx-1 h-4 w-px bg-[var(--jm-border)]" />
                <JmPill size="sm" active={provisionalOnly} onClick={() => setProvisionalOnly(!provisionalOnly)}>
                  <FlaskConical className="size-3" />
                  임시만
                </JmPill>
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmIconButton
                  variant="ghost"
                  size="sm"
                  aria-label="새로고침"
                  onClick={refresh}
                  disabled={itemsQuery.isFetching}
                >
                  {itemsQuery.isFetching ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </JmIconButton>
                <JmButton
                  size="sm"
                  variant="outline"
                  onClick={() => setAutoMapConfirmOpen(true)}
                  disabled={autoMapMutation.isPending}
                >
                  {autoMapMutation.isPending ? (
                    <JmSpinner size="sm" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  자동매핑 실행
                </JmButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            {unmappedCount > 0 && (
              <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-warning-bg)] px-5 py-2 text-jm-sm text-[var(--jm-warning-fg)]">
                <AlertTriangle className="size-4 shrink-0" />
                미매핑 상품 {unmappedCount}건 — 입고 확정 시 재고에 반영되지 않습니다
              </div>
            )}

            <div className="overflow-x-auto">
              <JmTable className="min-w-[1180px]">
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead>거래처</JmTableHead>
                    <JmTableHead>품명</JmTableHead>
                    <JmTableHead>규격</JmTableHead>
                    <JmTableHead>품번</JmTableHead>
                    <JmTableHead className="text-right">원가</JmTableHead>
                    <JmTableHead className="text-right">입고비용</JmTableHead>
                    <JmTableHead className="text-right">입고가</JmTableHead>
                    <JmTableHead>매핑 상태</JmTableHead>
                    <JmTableHead className="text-right">입고 횟수</JmTableHead>
                    <JmTableHead className="w-[64px] text-right">관리</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SupplierProductsRowSkeleton key={i} />)
                  ) : filteredItems.length === 0 ? (
                    <JmTableRow className="hover:bg-transparent">
                      <JmTableCell colSpan={10} className="py-12">
                        <JmEmpty
                          title={
                            searchQuery || selectedSupplier !== "all" || mappingFilter !== "all" || statusFilter !== "active" || provisionalOnly
                              ? "검색 결과가 없습니다"
                              : "거래처 상품이 없습니다"
                          }
                          description={
                            searchQuery || selectedSupplier !== "all" || mappingFilter !== "all" || statusFilter !== "active" || provisionalOnly
                              ? "다른 검색어/필터를 시도하세요"
                              : "거래처 상품을 먼저 등록하세요"
                          }
                        />
                      </JmTableCell>
                    </JmTableRow>
                  ) : (
                    filteredItems.map((sp) => {
                      const unit = parseFloat(sp.unitPrice) || 0;
                      const baseCost = unit * (sp.isTaxable ? 1.1 : 1);

                      const fixedSum = sp.incomingCosts
                        .filter((c) => c.costType === "FIXED")
                        .reduce((sum, c) => sum + parseFloat(c.value), 0);
                      const pctSum = sp.incomingCosts
                        .filter((c) => c.costType === "PERCENTAGE")
                        .reduce((sum, c) => {
                          const amount = (unit * parseFloat(c.value)) / 100;
                          return sum + (c.isTaxable ? amount * 1.1 : amount);
                        }, 0);
                      const shipping = sp.avgShippingCost ?? 0;
                      const incomingCost = fixedSum + pctSum + shipping;
                      const hasIncomingCost =
                        sp.incomingCosts.length > 0 || sp.avgShippingCost !== null;

                      const totalIncomingPrice = baseCost + incomingCost;
                      const hasBase = sp._count.incomingItems > 0 || sp.source === "INITIAL";

                      const latest = sp.priceHistory[0];
                      const priceDir = latest
                        ? parseFloat(latest.newPrice) > parseFloat(latest.oldPrice)
                          ? "up"
                          : parseFloat(latest.newPrice) < parseFloat(latest.oldPrice)
                            ? "down"
                            : null
                        : null;

                      return (
                        <JmTableRow
                          key={sp.id}
                          className={`cursor-pointer ${!sp.isActive ? "opacity-60" : ""}`}
                          onClick={() => router.push(`/supplier-products/${sp.id}`)}
                        >
                          <JmTableCell className="text-[var(--jm-text-muted)]">{sp.supplier.name}</JmTableCell>
                          <JmTableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/supplier-products/${sp.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--jm-text)] transition-colors hover:text-[var(--jm-accent-fg)]"
                              >
                                {sp.name}
                              </Link>
                              {sp.isProvisional && (
                                <JmBadge variant="warning" size="sm" shape="square">임시</JmBadge>
                              )}
                              {!sp.isActive && (
                                <JmBadge variant="default" size="sm" shape="pill">비활성</JmBadge>
                              )}
                            </div>
                          </JmTableCell>
                          <JmTableCell className="text-[var(--jm-text-muted)]">{sp.spec || "—"}</JmTableCell>
                          <JmTableCell className="text-[var(--jm-text-muted)]">{sp.supplierCode || "—"}</JmTableCell>

                          {/* 원가 */}
                          <JmTableCell className="text-right tabular-nums">
                            {hasBase ? (
                              <span className="inline-flex items-center gap-1">
                                ₩{Math.round(baseCost).toLocaleString("ko-KR")}
                                {sp._count.incomingItems > 0 && priceDir === "up" && <span className="text-[var(--jm-danger-fg)]">↑</span>}
                                {sp._count.incomingItems > 0 && priceDir === "down" && <span className="text-[var(--jm-info-fg)]">↓</span>}
                                {sp._count.incomingItems === 0 && sp.source === "INITIAL" && (
                                  <JmBadge variant="default" size="sm" shape="square" className="ml-1">기초</JmBadge>
                                )}
                              </span>
                            ) : (
                              <span className="text-[var(--jm-text-muted)]">—</span>
                            )}
                          </JmTableCell>

                          {/* 입고비용 */}
                          <JmTableCell className="text-right tabular-nums">
                            {hasIncomingCost && incomingCost > 0 ? (
                              <span>₩{Math.round(incomingCost).toLocaleString("ko-KR")}</span>
                            ) : (
                              <span className="text-jm-xs text-[var(--jm-text-muted)]">미등록</span>
                            )}
                          </JmTableCell>

                          {/* 입고가 */}
                          <JmTableCell className="text-right tabular-nums">
                            {hasBase && totalIncomingPrice > 0 ? (
                              <span className="font-medium">₩{Math.round(totalIncomingPrice).toLocaleString("ko-KR")}</span>
                            ) : (
                              <span className="text-[var(--jm-text-muted)]">—</span>
                            )}
                          </JmTableCell>

                          {/* 매핑 상태 */}
                          <JmTableCell
                            className="cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              sp.productMappings.length > 0
                                ? openMapping({ id: sp.id, supplierId: sp.supplierId, name: sp.name, unit: sp.unitOfMeasure })
                                : openMappingChoice(sp);
                            }}
                          >
                            {sp.productMappings.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {sp.productMappings.map((m) => {
                                  const noPrice = parseFloat(m.product.sellingPrice) === 0;
                                  return (
                                    <JmBadge
                                      key={m.id}
                                      variant={noPrice ? "warning" : "default"}
                                      size="sm"
                                      shape="square"
                                    >
                                      {m.product.name}
                                      {noPrice && <span className="ml-1">가격 미설정</span>}
                                    </JmBadge>
                                  );
                                })}
                              </div>
                            ) : (
                              <JmBadge variant="warning" size="sm" shape="square">
                                <AlertTriangle className="size-3" />
                                미매핑
                              </JmBadge>
                            )}
                          </JmTableCell>
                          <JmTableCell className="text-right tabular-nums">
                            {sp._count.incomingItems}
                          </JmTableCell>

                          {/* 관리 — 삭제 (활성일 때만) */}
                          <JmTableCell>
                            <div
                              className="flex justify-end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {sp.isActive && (
                                <JmTooltip content="비활성화">
                                  <JmIconButton
                                    variant="ghost"
                                    size="sm"
                                    aria-label="비활성화"
                                    onClick={() => setDeleteTarget(sp)}
                                  >
                                    <Archive className="size-4" />
                                  </JmIconButton>
                                </JmTooltip>
                              )}
                            </div>
                          </JmTableCell>
                        </JmTableRow>
                      );
                    })
                  )}
                </JmTableBody>
              </JmTable>
            </div>
          </JmCard>
        </div>
      </div>

      {/* 매핑 방법 선택 다이얼로그 */}
      <JmDialog open={choiceOpen} onOpenChange={setChoiceOpen}>
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>매핑 방법 선택</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">{choiceTarget?.name}</p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => openMapping()}
                className="flex flex-col items-start gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 text-left transition-colors hover:border-[var(--jm-border-strong)] hover:bg-[var(--jm-surface-muted)]"
              >
                <span className="flex items-center gap-2 text-jm-sm font-medium text-[var(--jm-text)]">
                  <Link2 className="size-4" />
                  기존 상품으로 매핑
                </span>
                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                  이미 등록된 판매 상품과 연결합니다
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setChoiceOpen(false);
                  const params = new URLSearchParams();
                  if (choiceTarget) {
                    params.set("supplierId", choiceTarget.supplierId);
                    params.set("supplierProductId", choiceTarget.id);
                  }
                  router.push(`/products/new?${params}`);
                }}
                className="flex flex-col items-start gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 text-left transition-colors hover:border-[var(--jm-border-strong)] hover:bg-[var(--jm-surface-muted)]"
              >
                <span className="flex items-center gap-2 text-jm-sm font-medium text-[var(--jm-text)]">
                  <Plus className="size-4" />
                  새 상품 등록
                </span>
                <span className="text-jm-xs text-[var(--jm-text-muted)]">
                  상품 등록 페이지로 이동합니다
                </span>
              </button>
            </div>
          </JmDialogBody>
        </JmDialogContent>
      </JmDialog>

      {dialogTarget && (
        <MappingSheet
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="supplier-to-product"
          supplierProductId={dialogTarget.id}
          supplierProductName={dialogTarget.name}
          supplierProductUnit={dialogTarget.unit}
          defaultProductId={defaultProductId}
          onMappingChange={refresh}
        />
      )}

      {/* 자동매핑 일괄 실행 확인 */}
      <JmDialog
        open={autoMapConfirmOpen}
        onOpenChange={(o) => !autoMapMutation.isPending && setAutoMapConfirmOpen(o)}
      >
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>미매핑 상품 자동매핑</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text)]">
              <span className="font-semibold">전체 거래처</span>의 모든 미매핑 active 상품에 대해 자동으로 자사 판매 상품을 생성하고 매핑합니다 (현재 화면 필터·검색 무관).
            </p>
            <ul className="mt-3 space-y-1 text-jm-xs text-[var(--jm-text-muted)]">
              <li>· 새 Product 는 <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5 text-[11px]">AUTO-XXXX</code> SKU 로 생성되며 <code className="rounded bg-[var(--jm-surface-muted)] px-1 py-0.5 text-[11px]">autoMapped</code> 표시됩니다</li>
              <li>· 환산비율 1:1 로 매핑됩니다</li>
              <li>· 기존 미매핑 입고 로트가 있으면 자동으로 흡수되어 재고에 반영됩니다</li>
              <li>· 이미 매핑된 상품은 영향받지 않습니다</li>
            </ul>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setAutoMapConfirmOpen(false)}
              disabled={autoMapMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              onClick={() => autoMapMutation.mutate()}
              disabled={autoMapMutation.isPending}
            >
              {autoMapMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
              {autoMapMutation.isPending ? "처리 중..." : "실행"}
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>

      {/* 비활성화 확인 다이얼로그 */}
      <JmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && !deleteMutation.isPending && setDeleteTarget(null)}
      >
        <JmDialogContent size="sm">
          <JmDialogHeader>
            <JmDialogTitle>거래처 상품 비활성화</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <p className="text-jm-sm text-[var(--jm-text)]">
              <span className="font-semibold">{deleteTarget?.name}</span> 을(를) 비활성화 합니다.
            </p>
            <p className="mt-2 text-jm-xs text-[var(--jm-text-muted)]">
              비활성화한 상품은 목록 상단에서 숨겨지고, 신규 입고·매핑에 선택할 수 없습니다.
              기존 입고 이력과 매핑은 그대로 유지됩니다.
            </p>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              취소
            </JmButton>
            <JmButton
              variant="danger"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <JmSpinner size="sm" tone="inverted" />}
              비활성화
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
      </JmTooltipProvider>
    </SupplierProductsThemeScope>
  );
}
