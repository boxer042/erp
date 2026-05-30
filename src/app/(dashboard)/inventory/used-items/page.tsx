"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Coins, Layers, Plus, Recycle, RefreshCw, Tag } from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
  JmIconButton,
  JmSearchInput,
  JmSegmentedControl,
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
  JmTableToolbarSearch,
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
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const listQuery = useQuery<UsedItemListRow[]>({
    queryKey: queryKeys.usedItems.list({ statusTab, search: appliedSearch }),
    queryFn: () => {
      const sp = new URLSearchParams();
      if (statusTab !== "ALL") sp.set("status", statusTab);
      if (appliedSearch.trim()) sp.set("search", appliedSearch.trim());
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
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <JmStat
            label="보관 중"
            value={
              listQuery.isPending ? <JmSkeleton className="h-7 w-12" /> : `${summary.count}개`
            }
            icon={<Boxes className="size-4" />}
            hint="판매·조립 가능"
            size="sm"
          />
          <JmStat
            label="누적 매입가치"
            value={
              listQuery.isPending ? (
                <JmSkeleton className="h-7 w-20" />
              ) : (
                `₩${Math.round(summary.totalCost).toLocaleString("ko-KR")}`
              )
            }
            icon={<Coins className="size-4" />}
            hint="보관 중 원가 합"
            size="sm"
          />
          <JmStat
            label="비카탈로그"
            value={
              listQuery.isPending ? <JmSkeleton className="h-7 w-12" /> : `${summary.noProduct}개`
            }
            icon={<Layers className="size-4" />}
            hint="카탈로그 미매칭"
            size="sm"
          />
          <JmStat
            label="시리얼 발번"
            value={
              listQuery.isPending ? <JmSkeleton className="h-7 w-12" /> : `${summary.withSerial}개`
            }
            icon={<Tag className="size-4" />}
            hint="라벨 출력됨"
            size="sm"
          />
        </div>

        {/* 메인 카드 — 툴바 + 테이블 */}
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onClear={() => {
                  setSearchInput("");
                  setAppliedSearch("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    setAppliedSearch(searchInput);
                  }
                }}
                placeholder="품명·코드 검색"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              <JmSegmentedControl
                value={statusTab}
                onChange={(v) => setStatusTab(v as UsedItemStatus | "ALL")}
                options={STATUS_TABS}
              />
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <Link href="/inventory/used-items/reconcile">
                <JmButton variant="ghost" size="sm">
                  <Recycle className="size-4" />
                  사후 정리
                </JmButton>
              </Link>
              <Link href="/inventory/used-items/build">
                <JmButton variant="ghost" size="sm">
                  <Layers className="size-4" />
                  조립품 만들기
                </JmButton>
              </Link>
              <Link href="/inventory/used-items/new">
                <JmButton variant="cta" size="sm">
                  <Plus className="size-4" />
                  중고 상품 등록
                </JmButton>
              </Link>
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={() => listQuery.refetch()}
                disabled={listQuery.isFetching}
              >
                <RefreshCw className={listQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
              </JmIconButton>
            </JmTableToolbarActions>
          </JmTableToolbar>
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
                    조건에 맞는 중고 상품이 없습니다
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
