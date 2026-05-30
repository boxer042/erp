"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
  JmInput,
  JmSegmentedControl,
  JmSkeleton,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

import {
  USED_ITEM_SOURCE_LABEL,
  totalUsedItemCost,
  daysInStock,
  usedItemName,
  type UsedItemListRow,
  type UsedItemStatus,
} from "@/components/used-items/_types";
import { UsedItemStatusBadge } from "@/components/used-items/used-item-status-badge";
import { UsedItemSourceBadge } from "@/components/used-items/used-item-source-badge";

const STATUS_TABS: { value: UsedItemStatus | "ALL"; label: string }[] = [
  { value: "IN_STOCK", label: "보관 중" },
  { value: "ASSEMBLED_INTO", label: "조립 흡수" },
  { value: "SOLD", label: "판매 완료" },
  { value: "SCRAPPED", label: "폐기" },
  { value: "ALL", label: "전체" },
];

function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i}>
          <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-16 rounded-md" /></JmTableCell>
          <JmTableCell className="text-right">
            <div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div>
          </JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-12" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
        </JmTableRow>
      ))}
    </>
  );
}

export default function UsedItemsPage() {
  const [statusTab, setStatusTab] = useState<UsedItemStatus | "ALL">("IN_STOCK");
  const [search, setSearch] = useState("");

  const listQuery = useQuery<UsedItemListRow[]>({
    queryKey: queryKeys.usedItems.list({ statusTab, search }),
    queryFn: () => {
      const sp = new URLSearchParams();
      if (statusTab !== "ALL") sp.set("status", statusTab);
      if (search.trim()) sp.set("search", search.trim());
      sp.set("includeProduct", "true");
      sp.set("includeCosts", "true");
      return apiGet<UsedItemListRow[]>(`/api/used-items?${sp}`);
    },
  });

  const rows = listQuery.data ?? [];

  // KPI — IN_STOCK 한정으로 집계
  const summary = useMemo(() => {
    const inStock = rows.filter((r) => r.status === "IN_STOCK");
    const totalCost = inStock.reduce(
      (s, r) => s + totalUsedItemCost(r as { acquiredCost: string; addedCosts?: Array<{ amount: string }> }),
      0,
    );
    return {
      count: inStock.length,
      totalCost,
      noProduct: inStock.filter((r) => !r.productId).length,
      withSerial: inStock.filter((r) => !!r.serialItemId).length,
    };
  }, [rows]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 + 액션 */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-xl font-semibold text-[var(--jm-text)]">중고 단품</h1>
            <p className="mt-0.5 text-jm-sm text-[var(--jm-text-muted)]">
              매입한 중고 단품 관리 — 보관·비용 가산·조립 활용·단품 판매
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/inventory/used-items/reconcile">
              <JmButton variant="outline" size="sm">
                사후 정리
              </JmButton>
            </Link>
            <Link href="/inventory/used-items/build">
              <JmButton variant="outline" size="sm">
                조립품 만들기
              </JmButton>
            </Link>
            <Link href="/inventory/used-items/new">
              <JmButton variant="cta">
                <Plus className="size-4" />
                중고 매입 등록
              </JmButton>
            </Link>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <JmStat label="보관 중" value={`${summary.count}대`} />
          <JmStat
            label="누적 매입가치"
            value={`₩${Math.round(summary.totalCost).toLocaleString("ko-KR")}`}
          />
          <JmStat label="비카탈로그" value={`${summary.noProduct}대`} />
          <JmStat label="시리얼 발번" value={`${summary.withSerial}대`} />
        </div>

        {/* 필터 + 검색 */}
        <JmCard className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <JmSegmentedControl
              value={statusTab}
              onChange={(v) => setStatusTab(v as UsedItemStatus | "ALL")}
              options={STATUS_TABS}
            />
            <div className="relative max-w-[320px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--jm-text-muted)]" />
              <JmInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="품명·코드 검색"
                className="pl-9"
              />
            </div>
            <JmButton
              variant="ghost"
              size="sm"
              onClick={() => listQuery.refetch()}
              aria-label="새로고침"
            >
              <RefreshCw className={listQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
            </JmButton>
          </div>
        </JmCard>

        {/* 테이블 */}
        <JmCard className="overflow-hidden">
          <JmTable>
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead>코드</JmTableHead>
                <JmTableHead>품명</JmTableHead>
                <JmTableHead>출처</JmTableHead>
                <JmTableHead className="text-right">매입가</JmTableHead>
                <JmTableHead className="text-right">누적비용</JmTableHead>
                <JmTableHead>상태</JmTableHead>
                <JmTableHead>보관일</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {listQuery.isPending ? (
                <SkeletonRows />
              ) : rows.length === 0 ? (
                <JmTableRow>
                  <JmTableCell colSpan={7} className="text-center py-8 text-jm-sm text-[var(--jm-text-muted)]">
                    조건에 맞는 중고 단품이 없습니다
                  </JmTableCell>
                </JmTableRow>
              ) : (
                rows.map((r) => {
                  const total = totalUsedItemCost(r as { acquiredCost: string; addedCosts?: Array<{ amount: string }> });
                  return (
                    <JmTableRow key={r.id} className="cursor-pointer hover:bg-[var(--jm-surface-muted)]">
                      <JmTableCell>
                        <Link
                          href={`/inventory/used-items/${r.id}`}
                          className="block font-[family-name:var(--jm-font-mono)] text-jm-xs text-[var(--jm-text)] hover:underline"
                        >
                          {r.internalCode}
                        </Link>
                      </JmTableCell>
                      <JmTableCell>
                        <Link href={`/inventory/used-items/${r.id}`} className="block">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--jm-text)]">
                              {usedItemName(r)}
                            </span>
                            {!r.productId && (
                              <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                                비카탈로그
                              </span>
                            )}
                          </div>
                          {r.product && (
                            <span className="text-jm-xs text-[var(--jm-text-muted)]">
                              {r.product.sku}
                            </span>
                          )}
                        </Link>
                      </JmTableCell>
                      <JmTableCell>
                        <UsedItemSourceBadge source={r.acquiredFrom} />
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{parseFloat(r.acquiredCost).toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        ₩{Math.round(total).toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell>
                        <UsedItemStatusBadge status={r.status} />
                      </JmTableCell>
                      <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">
                        {r.status === "IN_STOCK"
                          ? `${daysInStock(r.acquiredAt)}일`
                          : "—"}
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
  );
}

// 위 컴포넌트가 USED_ITEM_SOURCE_LABEL 을 import 만 하고 쓰지 않아 안내. 다음 단계에서 필터 추가 시 활용.
void USED_ITEM_SOURCE_LABEL;
