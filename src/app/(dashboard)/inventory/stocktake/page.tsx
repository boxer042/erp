"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmScope,
  JmButton,
  JmIconButton,
  JmCard,
  JmInput,
  JmSearchInput,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarSearch,
  JmTableToolbarFilters,
  JmTableToolbarActions,
  JmDialog,
  JmDialogContent,
  JmDialogHeader,
  JmDialogTitle,
  JmDialogFooter,
  JmSelect,
  JmBadge,
  JmEmpty,
  JmScrollArea,
  JmSkeleton,
} from "@/jm";
import { ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { STOCKTAKE_REASONS, STOCKTAKE_REASON_LABELS } from "@/lib/validators/stocktake";

function StocktakeSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-8 w-20 rounded-md" /></div></JmTableCell>
          <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-12" /></div></JmTableCell>
          <JmTableCell><JmSkeleton className="h-8 w-28 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-8 w-32 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-8 w-28 rounded-md" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

interface MappingOption {
  id: string;
  supplierProductId: string;
  supplierProductName: string;
  supplierName: string;
}

interface InventoryItem {
  id: string;
  productId: string;
  quantity: string;
  safetyStock: string;
  product: {
    id: string;
    name: string;
    sku: string;
    unitOfMeasure: string;
    isSet: boolean;
  };
  mappings: MappingOption[];
}

type Reason = (typeof STOCKTAKE_REASONS)[number];

interface StocktakeRow {
  productId: string;
  productName: string;
  sku: string;
  unitOfMeasure: string;
  isSet: boolean;
  systemQty: number;
  actualQty: string;
  reason: Reason;
  supplierProductId: string;
  mappings: MappingOption[];
  memo: string;
}

export default function StocktakePage() {
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showDiffOnly, setShowDiffOnly] = useState(false);

  const inventoriesQuery = useQuery({
    queryKey: queryKeys.stocktake.list(),
    queryFn: () => apiGet<InventoryItem[]>("/api/inventory/stocktake"),
  });
  const loading = inventoriesQuery.isPending;
  const fetchInventories = () => queryClient.invalidateQueries({ queryKey: queryKeys.stocktake.all });

  useEffect(() => {
    if (inventoriesQuery.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 동기화/리셋 이펙트 (서버데이터→편집폼 seed / 닫힐때 리셋 / URL prefill 등). 파생값 아님
      setRows(
        inventoriesQuery.data.map((inv) => ({
          productId: inv.productId,
          productName: inv.product.name,
          sku: inv.product.sku,
          unitOfMeasure: inv.product.unitOfMeasure,
          isSet: inv.product.isSet,
          systemQty: Number(inv.quantity),
          actualQty: Number(inv.quantity).toString(),
          reason: "PHYSICAL_COUNT" as Reason,
          supplierProductId: inv.mappings[0]?.supplierProductId || "",
          mappings: inv.mappings,
          memo: "",
        }))
      );
    }
  }, [inventoriesQuery.data]);

  const updateRow = (index: number, updates: Partial<StocktakeRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const filteredRows = rows.filter((r) => {
    const matchSearch = !search ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.sku.toLowerCase().includes(search.toLowerCase());
    const diff = parseFloat(r.actualQty) - r.systemQty;
    const matchDiff = !showDiffOnly || Math.abs(diff) >= 0.0001;
    return matchSearch && matchDiff;
  });

  const changedRows = rows.filter((r) => {
    const diff = parseFloat(r.actualQty) - r.systemQty;
    return Math.abs(diff) >= 0.0001;
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const missingSupplier = changedRows.filter((r) => {
        const diff = parseFloat(r.actualQty) - r.systemQty;
        return diff > 0 && !r.supplierProductId;
      });
      if (missingSupplier.length > 0) {
        throw new Error(`재고 증가 행은 공급상품 선택 필수: ${missingSupplier.map((r) => r.productName).join(", ")}`);
      }
      const items = changedRows.map((r) => {
        const diff = parseFloat(r.actualQty) - r.systemQty;
        return {
          productId: r.productId,
          actualQuantity: r.actualQty,
          reason: r.reason,
          supplierProductId: diff > 0 ? r.supplierProductId : undefined,
          memo: r.memo || undefined,
        };
      });
      if (items.length === 0) throw new Error("보정할 항목이 없습니다");
      return apiMutate<{ count: number }>("/api/inventory/stocktake", "POST", { items });
    },
    onSuccess: (result) => {
      toast.success(`${result.count}개 항목 실사 보정 완료`);
      setConfirmOpen(false);
      fetchInventories();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "보정 실패"),
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex h-full flex-col bg-[var(--jm-bg)] p-4">
        <JmCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                placeholder="상품명 또는 SKU 검색"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              <JmButton
                variant={showDiffOnly ? "cta" : "outline"}
                size="sm"
                onClick={() => setShowDiffOnly(!showDiffOnly)}
              >
                차이만
              </JmButton>
              {changedRows.length > 0 && (
                <span className="text-jm-xs text-[var(--jm-text-muted)]">{changedRows.length}건 변경</span>
              )}
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={fetchInventories}
                disabled={loading}
              >
                <RefreshCw className={loading ? "animate-spin" : ""} />
              </JmIconButton>
              <JmButton
                size="sm"
                disabled={changedRows.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                보정 적용
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          <JmScrollArea className="flex-1 min-h-0">
            <JmTable>
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>상품명</JmTableHead>
                  <JmTableHead>SKU</JmTableHead>
                  <JmTableHead>단위</JmTableHead>
                  <JmTableHead className="text-right">시스템 재고</JmTableHead>
                  <JmTableHead className="text-right w-[120px]">실사 수량</JmTableHead>
                  <JmTableHead className="text-right w-[90px]">차이</JmTableHead>
                  <JmTableHead className="w-[130px]">보정 사유</JmTableHead>
                  <JmTableHead className="w-[160px]">공급상품 (증가 시)</JmTableHead>
                  <JmTableHead className="w-[140px]">메모</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <StocktakeSkeletonRows />
                ) : filteredRows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={9} className="py-12">
                      <JmEmpty
                        icon={<ClipboardList className="size-8" />}
                        title="재고 데이터가 없습니다"
                        description={
                          search || showDiffOnly
                            ? "검색어나 필터를 바꿔보세요"
                            : "입고·기초등록 후 재고가 생기면 실사 보정 대상이 표시됩니다"
                        }
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                filteredRows.map((row) => {
                  const rowIndex = rows.findIndex((r) => r.productId === row.productId);
                  const diff = parseFloat(row.actualQty) - row.systemQty;
                  const hasDiff = Math.abs(diff) >= 0.0001;
                  const isIncrease = diff > 0;

                  return (
                    <JmTableRow key={row.productId}>
                      <JmTableCell className="font-medium">
                        {row.productName}
                        {row.isSet && <JmBadge className="ml-2" variant="default">세트</JmBadge>}
                      </JmTableCell>
                      <JmTableCell><JmBadge variant="outline">{row.sku}</JmBadge></JmTableCell>
                      <JmTableCell>{row.unitOfMeasure}</JmTableCell>
                      <JmTableCell className="text-right">{row.systemQty.toLocaleString("ko-KR")}</JmTableCell>
                      <JmTableCell className="p-1">
                        <JmInput
                          size="sm"
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.actualQty}
                          onChange={(e) => updateRow(rowIndex, { actualQty: e.target.value })}
                          className={`h-8 text-right text-jm-sm ${hasDiff ? "border-[var(--jm-warning-solid)]" : ""}`}
                        />
                      </JmTableCell>
                      <JmTableCell className={`text-right font-medium ${
                        !hasDiff ? "text-[var(--jm-text-muted)]" : diff > 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"
                      }`}>
                        {!hasDiff ? "0" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}`}
                      </JmTableCell>
                      <JmTableCell className="p-1">
                        <JmSelect
                          size="sm"
                          disabled={!hasDiff}
                          value={row.reason}
                          onChange={(v) => updateRow(rowIndex, { reason: (v ?? "PHYSICAL_COUNT") as Reason })}
                          options={STOCKTAKE_REASONS.map((r) => ({
                            value: r,
                            label: STOCKTAKE_REASON_LABELS[r],
                          }))}
                        />
                      </JmTableCell>
                      <JmTableCell className="p-1">
                        {isIncrease ? (
                          row.mappings.length === 0 ? (
                            <span className="text-jm-xs text-[var(--jm-danger-fg)]">매핑 없음</span>
                          ) : (
                            <JmSelect
                              size="sm"
                              placeholder="선택"
                              value={row.supplierProductId}
                              onChange={(v) => updateRow(rowIndex, { supplierProductId: v ?? "" })}
                              options={row.mappings.map((m) => ({
                                value: m.supplierProductId,
                                label: `${m.supplierProductName} (${m.supplierName})`,
                              }))}
                            />
                          )
                        ) : (
                          <span className="text-jm-xs text-[var(--jm-text-muted)]">—</span>
                        )}
                      </JmTableCell>
                      <JmTableCell className="p-1">
                        <JmInput
                          size="sm"
                          value={row.memo}
                          onChange={(e) => updateRow(rowIndex, { memo: e.target.value })}
                          className="h-8 text-jm-sm"
                          placeholder="메모"
                        />
                      </JmTableCell>
                    </JmTableRow>
                  );
                })
              )}
              </JmTableBody>
            </JmTable>
          </JmScrollArea>
        </JmCard>
      </div>

      <JmDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <JmDialogContent>
          <JmDialogHeader>
            <JmDialogTitle>실사 보정 확인</JmDialogTitle>
          </JmDialogHeader>
          <div className="space-y-3 px-5 text-jm-sm">
            <p>
              <strong>{changedRows.length}건</strong>의 재고를 보정합니다.
            </p>
            <JmScrollArea className="max-h-[300px] rounded-md border border-[var(--jm-border)]">
              <JmTable>
                <JmTableHeader>
                  <JmTableRow>
                    <JmTableHead className="text-jm-xs">상품</JmTableHead>
                    <JmTableHead className="text-jm-xs text-right">현재</JmTableHead>
                    <JmTableHead className="text-jm-xs text-right">실사</JmTableHead>
                    <JmTableHead className="text-jm-xs text-right">차이</JmTableHead>
                    <JmTableHead className="text-jm-xs">사유</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {changedRows.map((row) => {
                    const diff = parseFloat(row.actualQty) - row.systemQty;
                    return (
                      <JmTableRow key={row.productId}>
                        <JmTableCell className="text-jm-xs">{row.productName}</JmTableCell>
                        <JmTableCell className="text-jm-xs text-right">{row.systemQty.toLocaleString("ko-KR")}</JmTableCell>
                        <JmTableCell className="text-jm-xs text-right">{parseFloat(row.actualQty).toLocaleString("ko-KR")}</JmTableCell>
                        <JmTableCell className={`text-jm-xs text-right font-medium ${diff > 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                          {diff > 0 ? "+" : ""}{diff.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}
                        </JmTableCell>
                        <JmTableCell className="text-jm-xs">{STOCKTAKE_REASON_LABELS[row.reason]}</JmTableCell>
                      </JmTableRow>
                    );
                  })}
                </JmTableBody>
              </JmTable>
            </JmScrollArea>
          </div>
          <JmDialogFooter>
            <JmButton variant="outline" onClick={() => setConfirmOpen(false)}>취소</JmButton>
            <JmButton onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              보정 적용
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </JmScope>
  );
}
