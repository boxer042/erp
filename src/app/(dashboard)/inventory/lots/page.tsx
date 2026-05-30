"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { AlertTriangle, Coins, Layers, Package, RefreshCw } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { SupplierCombobox } from "@/components/supplier-combobox";
import {
  JmBadge,
  JmCard,
  JmCheckbox,
  JmEmpty,
  JmIconButton,
  JmScope,
  JmSelect,
  JmSkeleton,
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
} from "@/jm";

interface Lot {
  id: string;
  productId: string | null;
  product: { id: string; name: string; sku: string } | null;
  supplierProduct: {
    id: string;
    name: string;
    supplierCode: string | null;
    spec: string | null;
    unitOfMeasure: string;
    supplier: { id: string; name: string };
  } | null;
  receivedQty: string;
  remainingQty: string;
  unitCost: string;
  receivedAt: string;
  source: "INCOMING" | "INITIAL" | "ADJUSTMENT" | "SET_PRODUCE";
  memo: string | null;
}

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

const sourceLabels: Record<string, string> = {
  INCOMING: "입고",
  INITIAL: "기초",
  ADJUSTMENT: "조정",
  SET_PRODUCE: "세트조립",
};

const sourceJmVariants: Record<string, "info" | "success" | "warning" | "accent"> = {
  INCOMING: "info",
  INITIAL: "success",
  ADJUSTMENT: "warning",
  SET_PRODUCE: "accent",
};

const formatWon = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const formatQty = (v: string | number) =>
  parseFloat(String(v)).toLocaleString("ko-KR");

const MAPPED_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mapped", label: "매핑" },
  { value: "orphan", label: "미매핑" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "모든 소스" },
  { value: "INCOMING", label: "입고" },
  { value: "INITIAL", label: "기초" },
  { value: "ADJUSTMENT", label: "조정" },
  { value: "SET_PRODUCE", label: "세트조립" },
  // 적자 — receivedQty=0 + remainingQty<0 + source=ADJUSTMENT 로 derive. 서버에서 동일 조건으로 필터.
  { value: "DEFICIT", label: "적자만" },
];

function LotsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-12" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-12" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-16" />
            </div>
          </JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-4 w-20" />
            </div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function InventoryLotsPage() {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const [supplierId, setSupplierId] = useState("");
  const [mapped, setMapped] = useState<"all" | "mapped" | "orphan">("all");
  const [source, setSource] = useState<
    "all" | "INCOMING" | "INITIAL" | "ADJUSTMENT" | "SET_PRODUCE"
  >("all");
  const [hasRemaining, setHasRemaining] = useState(false);

  const lotsQuery = useQuery({
    queryKey: queryKeys.lots.list({ supplierId, mapped, source, hasRemaining }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (supplierId) params.set("supplierId", supplierId);
      if (mapped !== "all") params.set("mapped", mapped);
      if (source !== "all") params.set("source", source);
      if (hasRemaining) params.set("hasRemaining", "true");
      return apiGet<Lot[]>(`/api/inventory/lots?${params}`);
    },
  });
  const lots = lotsQuery.data ?? [];
  const loading = lotsQuery.isPending;
  const refreshing = lotsQuery.isFetching && !loading;
  const fetchLots = () => queryClient.invalidateQueries({ queryKey: queryKeys.lots.all });

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
  });
  const suppliers = suppliersQuery.data ?? [];

  const totalRemainingValue = lots.reduce(
    (sum, l) => sum + parseFloat(l.remainingQty) * parseFloat(l.unitCost),
    0,
  );
  const orphanLots = lots.filter((l) => l.productId === null);
  const orphanRemainingValue = orphanLots.reduce(
    (sum, l) => sum + parseFloat(l.remainingQty) * parseFloat(l.unitCost),
    0,
  );

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        <div className="flex w-full flex-col gap-6 p-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <JmStat
              label="총 로트"
              value={
                loading ? (
                  <JmSkeleton className="h-7 w-16" />
                ) : (
                  `${lots.length.toLocaleString("ko-KR")}건`
                )
              }
              icon={<Layers className="size-4" />}
              hint="현재 필터 기준"
              size="sm"
            />
            <JmStat
              label="잔량 원가합계"
              value={
                loading ? (
                  <JmSkeleton className="h-7 w-24" />
                ) : (
                  formatWon(totalRemainingValue)
                )
              }
              icon={<Coins className="size-4" />}
              hint="남은 재고 자산"
              size="sm"
            />
            {orphanLots.length > 0 && (
              <JmStat
                label="미매핑"
                value={
                  loading ? (
                    <JmSkeleton className="h-7 w-16" />
                  ) : (
                    `${orphanLots.length.toLocaleString("ko-KR")}건`
                  )
                }
                icon={<AlertTriangle className="size-4" />}
                hint={formatWon(orphanRemainingValue)}
                positiveIsGood={false}
                size="sm"
              />
            )}
          </div>

          {/* 메인 카드 — 툴바 + 테이블 */}
          <JmCard className="overflow-hidden p-0">
            <JmTableToolbar>
              <JmTableToolbarFilters>
                <div className="w-[200px]">
                  <SupplierCombobox
                    suppliers={suppliers}
                    value={supplierId}
                    onChange={(id) => setSupplierId(id)}
                    onCreateNew={() => {}}
                    clearable
                    placeholder="전체 거래처"
                  />
                </div>
                <JmSelect
                  size="sm"
                  className="w-[110px]"
                  options={MAPPED_OPTIONS}
                  value={mapped}
                  onChange={(v) => setMapped(v as typeof mapped)}
                />
                <JmSelect
                  size="sm"
                  className="w-[110px]"
                  options={SOURCE_OPTIONS}
                  value={source}
                  onChange={(v) => setSource(v as typeof source)}
                />
                <label className="flex items-center gap-1.5 text-jm-sm text-[var(--jm-text-muted)] cursor-pointer select-none">
                  <JmCheckbox
                    checked={hasRemaining}
                    onCheckedChange={(c) => setHasRemaining(c === true)}
                  />
                  잔량만
                </label>
              </JmTableToolbarFilters>
              <JmTableToolbarActions>
                <JmIconButton
                  aria-label="새로고침"
                  size="sm"
                  variant="ghost"
                  onClick={fetchLots}
                  disabled={loading}
                >
                  <RefreshCw className={refreshing ? "animate-spin" : ""} />
                </JmIconButton>
              </JmTableToolbarActions>
            </JmTableToolbar>

            <JmTable className="min-w-[1100px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>수령일</JmTableHead>
                  <JmTableHead>거래처</JmTableHead>
                  <JmTableHead>공급상품</JmTableHead>
                  <JmTableHead>매핑 판매상품</JmTableHead>
                  <JmTableHead className="text-right">수령</JmTableHead>
                  <JmTableHead className="text-right">잔량</JmTableHead>
                  <JmTableHead className="text-right">단가</JmTableHead>
                  <JmTableHead className="text-right">잔량 원가</JmTableHead>
                  <JmTableHead>소스</JmTableHead>
                  <JmTableHead>메모</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {loading ? (
                  <LotsSkeletonRows />
                ) : lots.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={10} className="py-12">
                      <JmEmpty
                        icon={<Package className="size-8" />}
                        title="로트가 없습니다"
                        description="입고·기초등록·실사보정으로 재고 로트가 생성되면 여기에 표시됩니다"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                lots.map((lot) => {
                  const remainingValue =
                    parseFloat(lot.remainingQty) * parseFloat(lot.unitCost);
                  return (
                    <JmTableRow key={lot.id}>
                      <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] tabular-nums">
                        {new Date(lot.receivedAt).toLocaleDateString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-[var(--jm-text)]">
                        {lot.supplierProduct ? (
                          lot.supplierProduct.supplier.name
                        ) : (
                          <span className="text-[var(--jm-text-muted)]">-</span>
                        )}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2">
                        {lot.supplierProduct ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-[var(--jm-text)]">
                              {lot.supplierProduct.name}
                            </span>
                            {lot.supplierProduct.supplierCode && (
                              <span className="text-jm-xs text-[var(--jm-text-muted)]">
                                {lot.supplierProduct.supplierCode}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--jm-text-muted)]">-</span>
                        )}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2">
                        {lot.product ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[var(--jm-text)]">{lot.product.name}</span>
                            <span className="text-jm-xs text-[var(--jm-text-muted)]">
                              {lot.product.sku}
                            </span>
                          </div>
                        ) : (
                          <JmBadge variant="warning" size="sm" shape="square">
                            <AlertTriangle className="size-3 mr-1" />
                            미매핑
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        {formatQty(lot.receivedQty)}
                      </JmTableCell>
                      <JmTableCell
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          parseFloat(lot.remainingQty) < 0
                            ? "text-[var(--jm-danger-fg)]"
                            : "text-[var(--jm-text)]"
                        }`}
                      >
                        {formatQty(lot.remainingQty)}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                        {formatWon(parseFloat(lot.unitCost))}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-right tabular-nums text-[var(--jm-text)]">
                        {formatWon(remainingValue)}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2">
                        {/* 적자 로트 — 의도적 ADJUSTMENT 와 구분해서 빨간 "적자" 배지 */}
                        {parseFloat(lot.receivedQty) === 0 &&
                        parseFloat(lot.remainingQty) < 0 &&
                        lot.source === "ADJUSTMENT" ? (
                          <JmBadge variant="danger" size="sm" shape="square">
                            적자
                          </JmBadge>
                        ) : (
                          <JmBadge
                            variant={sourceJmVariants[lot.source] ?? "default"}
                            size="sm"
                            shape="square"
                          >
                            {sourceLabels[lot.source]}
                          </JmBadge>
                        )}
                      </JmTableCell>
                      <JmTableCell className="px-3 py-2 text-[var(--jm-text-muted)] text-jm-xs">
                        {lot.memo || "-"}
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
    </JmScope>
  );
}
