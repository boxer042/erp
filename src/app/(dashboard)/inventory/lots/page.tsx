"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { SupplierCombobox } from "@/components/supplier-combobox";
import {
  JmBadge,
  JmCheckbox,
  JmIconButton,
  JmScope,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
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
      <div className="flex h-full flex-col bg-[var(--jm-bg)]">
        {/* 툴바 */}
        <div className="flex items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-2 shrink-0">
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
          <div className="ml-auto">
            <JmIconButton
              aria-label="새로고침"
              size="sm"
              variant="ghost"
              onClick={fetchLots}
              disabled={loading}
            >
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
            </JmIconButton>
          </div>
        </div>

        {/* 요약 */}
        <div className="min-h-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-1 text-jm-xs text-[var(--jm-text-muted)] shrink-0">
          <div>
            총 로트:{" "}
            <span className="font-medium text-[var(--jm-text)] tabular-nums">
              {lots.length}건
            </span>
          </div>
          <span className="text-[var(--jm-text-muted)]/50">|</span>
          <div>
            잔량 원가합계:{" "}
            <span className="font-medium text-[var(--jm-text)] tabular-nums">
              {formatWon(totalRemainingValue)}
            </span>
          </div>
          {orphanLots.length > 0 && (
            <>
              <span className="text-[var(--jm-text-muted)]/50">|</span>
              <div>
                미매핑:{" "}
                <span className="font-medium text-[var(--jm-warning-fg)] tabular-nums">
                  {orphanLots.length}건 · {formatWon(orphanRemainingValue)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <JmTable className="min-w-[1100px]">
            <JmTableHeader className="sticky top-0 z-10">
              <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">수령일</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">거래처</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">공급상품</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">매핑 판매상품</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">수령</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">잔량</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">단가</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 text-right font-medium">잔량 원가</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">소스</JmTableHead>
                <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">메모</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {loading ? (
                <LotsSkeletonRows />
              ) : lots.length === 0 ? (
                <JmTableRow className="hover:bg-transparent">
                  <JmTableCell
                    colSpan={10}
                    className="text-center py-10 text-[var(--jm-text-muted)] text-sm"
                  >
                    로트가 없습니다
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
        </div>
      </div>
    </JmScope>
  );
}
