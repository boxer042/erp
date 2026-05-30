"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmInput,
  JmBadge,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

interface ProductRef {
  id: string;
  name: string;
  sku: string;
}

interface FunnelRow {
  entryProduct: ProductRef;
  finalProduct: ProductRef | null;
  orderCount: number;
  quantity: number;
  revenue: number;
  isSwap: boolean;
}

interface EntrySummary {
  entryProduct: ProductRef;
  orderCount: number;
  quantity: number;
  revenue: number;
  swapCount: number;
  swapRate: number;
}

interface FunnelResponse {
  rows: FunnelRow[];
  entrySummary: EntrySummary[];
  total: {
    orderCount: number;
    quantity: number;
    revenue: number;
    swapCount: number;
    swapRate: number;
  };
  period: { from: string | null; to: string | null };
}

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

function dayOffsetStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

export default function OptionFunnelPage() {
  const [from, setFrom] = useState(() => dayOffsetStr(-30));
  const [to, setTo] = useState(() => todayStr());

  const query = useQuery({
    queryKey: queryKeys.reports.optionFunnel({ from, to }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiGet<FunnelResponse>(`/api/reports/option-funnel?${params}`);
    },
  });

  const data = query.data;

  // entryProduct 별로 그룹화 — 표시 트리
  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { entry: EntrySummary; rows: FunnelRow[] }
    >();
    for (const e of data.entrySummary) {
      map.set(e.entryProduct.id, { entry: e, rows: [] });
    }
    for (const r of data.rows) {
      map.get(r.entryProduct.id)?.rows.push(r);
    }
    return Array.from(map.values());
  }, [data]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="border-b border-[var(--jm-border)] px-5 py-3 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">옵션 funnel</h1>
          <p className="text-jm-xs text-[var(--jm-text-muted)]">
            자사몰·외부 채널 한정 — 손님이 진입한 카탈로그 SKU 와 실제 결제된 SKU 비교 (POS 제외)
          </p>
        </div>
        <div className="flex items-end gap-2 ml-auto">
          <div>
            <label className="text-jm-2xs text-[var(--jm-text-muted)]">From</label>
            <JmInput
              size="sm"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[140px]"
            />
          </div>
          <div>
            <label className="text-jm-2xs text-[var(--jm-text-muted)]">To</label>
            <JmInput
              size="sm"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[140px]"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 전체 요약 KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="진입 → 결제 주문"
            value={
              query.isPending
                ? null
                : `${(data?.total.orderCount ?? 0).toLocaleString("ko-KR")}건`
            }
          />
          <KpiCard
            label="합계 매출"
            value={
              query.isPending
                ? null
                : `₩${(data?.total.revenue ?? 0).toLocaleString("ko-KR")}`
            }
          />
          <KpiCard
            label="SWAP 발생"
            value={
              query.isPending
                ? null
                : `${(data?.total.swapCount ?? 0).toLocaleString("ko-KR")}건`
            }
            hint={
              query.isPending
                ? undefined
                : `진입 SKU ≠ 결제 SKU 인 케이스`
            }
          />
          <KpiCard
            label="SWAP 비율"
            value={
              query.isPending
                ? null
                : `${((data?.total.swapRate ?? 0) * 100).toFixed(1)}%`
            }
          />
        </div>

        {/* 진입 페이지 단위 요약 */}
        <JmCard>
          <JmCardHeader className="pb-2">
            <JmCardTitle className="text-jm-base">진입 페이지별 요약</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="p-0">
            <JmTable className="min-w-[800px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>진입 SKU</JmTableHead>
                  <JmTableHead>상품명</JmTableHead>
                  <JmTableHead className="text-right">주문</JmTableHead>
                  <JmTableHead className="text-right">수량</JmTableHead>
                  <JmTableHead className="text-right">매출</JmTableHead>
                  <JmTableHead className="text-right">SWAP</JmTableHead>
                  <JmTableHead className="text-right">SWAP 비율</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {query.isPending ? (
                  <SkeletonRows colSpan={7} />
                ) : (data?.entrySummary ?? []).length === 0 ? (
                  <JmTableRow>
                    <JmTableCell colSpan={7} className="text-center py-8 text-[var(--jm-text-muted)]">
                      집계할 데이터가 없습니다 (entryProductId 가 채워진 자사몰/채널 주문 한정)
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  data!.entrySummary.map((e) => (
                    <JmTableRow key={e.entryProduct.id}>
                      <JmTableCell className="font-mono text-jm-xs">
                        {e.entryProduct.sku}
                      </JmTableCell>
                      <JmTableCell>{e.entryProduct.name}</JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {e.orderCount.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {e.quantity.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums font-semibold">
                        ₩{e.revenue.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {e.swapCount.toLocaleString("ko-KR")}
                      </JmTableCell>
                      <JmTableCell className="text-right tabular-nums">
                        {(e.swapRate * 100).toFixed(1)}%
                      </JmTableCell>
                    </JmTableRow>
                  ))
                )}
              </JmTableBody>
            </JmTable>
          </JmCardContent>
        </JmCard>

        {/* 진입 → 결제 매트릭스 */}
        <JmCard>
          <JmCardHeader className="pb-2">
            <JmCardTitle className="text-jm-base">진입 → 결제 매트릭스</JmCardTitle>
          </JmCardHeader>
          <JmCardContent className="p-0">
            <JmTable className="min-w-[900px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead>진입 SKU</JmTableHead>
                  <JmTableHead>결제 SKU</JmTableHead>
                  <JmTableHead>SWAP</JmTableHead>
                  <JmTableHead className="text-right">주문</JmTableHead>
                  <JmTableHead className="text-right">수량</JmTableHead>
                  <JmTableHead className="text-right">매출</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {query.isPending ? (
                  <SkeletonRows colSpan={6} />
                ) : grouped.length === 0 ? (
                  <JmTableRow>
                    <JmTableCell colSpan={6} className="text-center py-8 text-[var(--jm-text-muted)]">
                      집계할 데이터가 없습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  grouped.flatMap((g) =>
                    g.rows.map((r, idx) => (
                      <JmTableRow key={`${r.entryProduct.id}-${r.finalProduct?.id ?? "null"}-${idx}`}>
                        <JmTableCell className="text-jm-xs">
                          {idx === 0 ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {r.entryProduct.name}
                              </span>
                              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                                {r.entryProduct.sku}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[var(--jm-text-muted)]">↳</span>
                          )}
                        </JmTableCell>
                        <JmTableCell className="text-jm-xs">
                          <div className="flex flex-col">
                            <span>{r.finalProduct?.name ?? "(삭제됨)"}</span>
                            {r.finalProduct?.sku && (
                              <span className="font-mono text-jm-2xs text-[var(--jm-text-muted)]">
                                {r.finalProduct.sku}
                              </span>
                            )}
                          </div>
                        </JmTableCell>
                        <JmTableCell>
                          {r.isSwap ? (
                            <JmBadge variant="info" size="sm">SWAP</JmBadge>
                          ) : (
                            <span className="text-jm-2xs text-[var(--jm-text-muted)]">−</span>
                          )}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums">
                          {r.orderCount.toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums">
                          {r.quantity.toLocaleString("ko-KR")}
                        </JmTableCell>
                        <JmTableCell className="text-right tabular-nums">
                          ₩{r.revenue.toLocaleString("ko-KR")}
                        </JmTableCell>
                      </JmTableRow>
                    )),
                  )
                )}
              </JmTableBody>
            </JmTable>
          </JmCardContent>
        </JmCard>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <JmCard>
      <JmCardHeader className="pb-1.5">
        <span className="text-jm-2xs text-[var(--jm-text-muted)] uppercase tracking-wider">
          {label}
        </span>
      </JmCardHeader>
      <JmCardContent>
        {value === null ? (
          <JmSkeleton className="h-7 w-24" />
        ) : (
          <div className="text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">{value}</div>
        )}
        {hint && (
          <div className="text-jm-2xs text-[var(--jm-text-muted)] mt-0.5">{hint}</div>
        )}
      </JmCardContent>
    </JmCard>
  );
}

function SkeletonRows({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <JmTableRow key={i}>
          {Array.from({ length: colSpan }).map((_, j) => (
            <JmTableCell key={j}>
              <JmSkeleton className="h-4 w-24" />
            </JmTableCell>
          ))}
        </JmTableRow>
      ))}
    </>
  );
}
