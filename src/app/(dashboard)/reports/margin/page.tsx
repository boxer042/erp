"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmCard, JmCardContent, JmCardHeader, JmCardTitle,
  JmSelect,
  JmTable, JmTableBody, JmTableCell, JmTableHead, JmTableHeader, JmTableRow,
  JmButton,
  JmSkeleton,
  JmAlert,
} from "@/jm";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { toCSV, downloadCSV } from "@/lib/utils";

interface PeriodSummary {
  orderCount: number;
  itemCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount?: number;
  opexAmount: number;
  opexByCategory: { category: string; amount: number }[];
  netProfit: number;
  marginRate: number;
}

interface OrderRow {
  id: string;
  orderNo: string;
  orderDate: string;
  channelName: string;
  itemCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  shippingCostAmount?: number;
  netProfit: number;
  marginRate: number;
}

interface ChannelGroup {
  channelId: string | null;
  channelName: string;
  orderCount: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  netProfit: number;
  marginRate: number;
}

interface ProductGroup {
  productId: string;
  productName: string;
  sku: string;
  spec: string | null;
  quantity: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  shippingCostAmount: number;
  netProfit: number;
  marginRate: number;
}

interface CategoryGroup {
  categoryId: string | null;
  categoryName: string;
  quantity: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
  commissionAmount: number;
  cardFeeAmount: number;
  sellingCostAmount: number;
  shippingCostAmount: number;
  netProfit: number;
  marginRate: number;
}

interface ReportData {
  period: { from: string; to: string };
  prevPeriod: { from: string; to: string };
  summary: PeriodSummary;
  prevSummary: PeriodSummary;
  orders: OrderRow[];
  channelGroups: ChannelGroup[];
  productGroups: ProductGroup[];
  categoryGroups: CategoryGroup[];
  missingCostCount?: number;
  missingCostOrderIds?: string[];
}

interface Channel {
  id: string;
  name: string;
}

type PeriodKey = "this-month" | "last-month" | "last-7d" | "last-30d";

function getPeriodRange(key: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  if (key === "this-month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  if (key === "last-month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  if (key === "last-7d") {
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const from = new Date(to);
    from.setDate(from.getDate() - 7);
    return { from, to };
  }
  // last-30d
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from, to };
}

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function deltaPct(curr: number, prev: number): { value: number; sign: "up" | "down" | "flat" } {
  if (prev === 0) return { value: 0, sign: "flat" };
  const v = ((curr - prev) / Math.abs(prev)) * 100;
  return { value: Math.abs(v), sign: v > 0 ? "up" : v < 0 ? "down" : "flat" };
}

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const { value, sign } = deltaPct(curr, prev);
  if (sign === "flat") return <span className="text-jm-2xs text-[var(--jm-text-muted)]">— vs 이전</span>;
  const color = sign === "up" ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]";
  const arrow = sign === "up" ? "▲" : "▼";
  return (
    <span className={`text-jm-2xs tabular-nums ${color}`}>
      {arrow} {value.toFixed(1)}% vs 이전
    </span>
  );
}

type TopProductSort = "revenue" | "netProfit";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this-month", label: "이번 달" },
  { value: "last-month", label: "전월" },
  { value: "last-7d", label: "최근 7일" },
  { value: "last-30d", label: "최근 30일" },
];

const TOP_SORT_OPTIONS: { value: TopProductSort; label: string }[] = [
  { value: "revenue", label: "매출 기준" },
  { value: "netProfit", label: "실수익 기준" },
];

export default function MarginReportPage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodKey>("this-month");
  const [channelId, setChannelId] = useState<string>("all");
  const [topSort, setTopSort] = useState<TopProductSort>("revenue");

  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<Channel[]>("/api/channels"),
  });
  const channels = channelsQuery.data ?? [];

  const reportQuery = useQuery({
    queryKey: queryKeys.reports.margin({ period, channelId }),
    queryFn: () => {
      const { from, to } = getPeriodRange(period);
      const qs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      if (channelId !== "all") qs.set("channelId", channelId);
      return apiGet<ReportData>(`/api/reports/margin?${qs}`);
    },
  });
  const data = reportQuery.data ?? null;
  const loading = reportQuery.isPending;
  const fetchData = () => queryClient.invalidateQueries({ queryKey: ["reports", "margin"] });

  const channelOptions = [
    { value: "all", label: "전체 채널" },
    ...channels.map((c) => ({ value: c.id, label: c.name })),
  ];

  const handleExport = (kind: "orders" | "channels" | "products" | "categories") => {
    if (!data) return;
    const fromStr = format(new Date(data.period.from), "yyyy-MM-dd");
    const toStr = format(new Date(data.period.to), "yyyy-MM-dd");
    let csv = "";
    let filename = "";

    if (kind === "orders") {
      csv = toCSV(data.orders, [
        { key: "orderDate", label: "주문일" },
        { key: "orderNo", label: "주문번호" },
        { key: "channelName", label: "채널" },
        { key: "itemCount", label: "품목수" },
        { key: "revenue", label: "매출(VAT포함)" },
        { key: "supplyRevenue", label: "공급가매출" },
        { key: "costAmount", label: "원가" },
        { key: "commissionAmount", label: "수수료" },
        { key: "cardFeeAmount", label: "카드수수료" },
        { key: "netProfit", label: "실순이익" },
        { key: "marginRate", label: "마진율(%)" },
      ]);
      filename = `margin-orders-${fromStr}_${toStr}.csv`;
    } else if (kind === "channels") {
      csv = toCSV(data.channelGroups, [
        { key: "channelName", label: "채널" },
        { key: "orderCount", label: "주문수" },
        { key: "revenue", label: "매출(VAT포함)" },
        { key: "supplyRevenue", label: "공급가매출" },
        { key: "costAmount", label: "원가" },
        { key: "commissionAmount", label: "수수료" },
        { key: "cardFeeAmount", label: "카드수수료" },
        { key: "netProfit", label: "실순이익" },
        { key: "marginRate", label: "마진율(%)" },
      ]);
      filename = `margin-channels-${fromStr}_${toStr}.csv`;
    } else if (kind === "categories") {
      csv = toCSV(data.categoryGroups, [
        { key: "categoryName", label: "카테고리" },
        { key: "quantity", label: "판매수량" },
        { key: "revenue", label: "매출(VAT포함)" },
        { key: "supplyRevenue", label: "공급가매출" },
        { key: "costAmount", label: "원가" },
        { key: "commissionAmount", label: "수수료" },
        { key: "shippingCostAmount", label: "배송원가" },
        { key: "netProfit", label: "실순이익" },
        { key: "marginRate", label: "마진율(%)" },
      ]);
      filename = `margin-categories-${fromStr}_${toStr}.csv`;
    } else {
      const sorted = [...data.productGroups].sort((a, b) =>
        topSort === "revenue" ? b.revenue - a.revenue : b.netProfit - a.netProfit
      );
      csv = toCSV(sorted, [
        { key: "productName", label: "상품명" },
        { key: "spec", label: "규격" },
        { key: "sku", label: "SKU" },
        { key: "quantity", label: "판매수량" },
        { key: "revenue", label: "매출(VAT포함)" },
        { key: "supplyRevenue", label: "공급가매출" },
        { key: "costAmount", label: "원가" },
        { key: "shippingCostAmount", label: "배송원가" },
        { key: "netProfit", label: "실순이익" },
        { key: "marginRate", label: "마진율(%)" },
      ]);
      filename = `margin-products-${fromStr}_${toStr}.csv`;
    }
    downloadCSV(filename, csv);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-jm-lg font-semibold text-[var(--jm-text)]">마진 리포트</h2>
            <p className="text-jm-sm text-[var(--jm-text-muted)]">매출 시점의 실제 원가·수수료를 반영한 실순이익 분석</p>
          </div>
          <div className="flex gap-2">
            <JmSelect
              variant="pill"
              size="sm"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(v) => setPeriod(v as PeriodKey)}
            />
            <JmSelect
              variant="pill"
              size="sm"
              options={channelOptions}
              value={channelId}
              onChange={(v) => setChannelId(v ?? "all")}
            />
          </div>
        </div>

        {loading || !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3 space-y-2">
                  <JmSkeleton className="h-3 w-16" />
                  <JmSkeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
            <JmSkeleton className="h-3 w-64" />
            {[8, 6].map((rows, ci) => (
              <JmCard key={ci}>
                <JmCardHeader className="flex flex-row items-center justify-between">
                  <JmSkeleton className="h-4 w-24" />
                  <JmSkeleton className="h-8 w-16 rounded-md" />
                </JmCardHeader>
                <JmCardContent className="p-0">
                  <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] grid grid-cols-8 gap-2 px-3 py-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <JmSkeleton key={i} className="h-3 w-full" />
                    ))}
                  </div>
                  {Array.from({ length: rows }).map((_, r) => (
                    <div key={r} className="border-b border-[var(--jm-border)] grid grid-cols-8 gap-2 px-3 py-2 items-center">
                      <JmSkeleton className="h-4 w-full col-span-1" />
                      {Array.from({ length: 7 }).map((_, c) => (
                        <div key={c} className="flex justify-end">
                          <JmSkeleton className="h-4 w-16" />
                        </div>
                      ))}
                    </div>
                  ))}
                </JmCardContent>
              </JmCard>
            ))}
          </div>
        ) : (
          <>
            {/* 원가 정보 누락 경고 */}
            {data.missingCostCount && data.missingCostCount > 0 ? (
              <JmAlert variant="warning">
                {data.missingCostCount}건의 주문 항목에 원가 정보가 누락되어 마진이 과대 표시될 수 있습니다.
                {data.missingCostOrderIds && data.missingCostOrderIds.length > 0 && (
                  <span className="ml-2 text-jm-xs opacity-80">
                    (관련 주문 {data.missingCostOrderIds.length}건)
                  </span>
                )}
              </JmAlert>
            ) : null}

            {/* 요약 카드 그리드 */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <SummaryCard
                title="매출 (VAT포함)"
                value={`₩${fmt(data.summary.revenue)}`}
                delta={<DeltaBadge curr={data.summary.revenue} prev={data.prevSummary.revenue} />}
              />
              <SummaryCard
                title="매출원가"
                value={`₩${fmt(data.summary.costAmount)}`}
                delta={<DeltaBadge curr={data.summary.costAmount} prev={data.prevSummary.costAmount} />}
              />
              <SummaryCard
                title="채널 수수료"
                value={`₩${fmt(data.summary.commissionAmount)}`}
                delta={<DeltaBadge curr={data.summary.commissionAmount} prev={data.prevSummary.commissionAmount} />}
              />
              <SummaryCard
                title="카드 수수료"
                value={`₩${fmt(data.summary.cardFeeAmount)}`}
                delta={<DeltaBadge curr={data.summary.cardFeeAmount} prev={data.prevSummary.cardFeeAmount} />}
              />
              <SummaryCard
                title="운영경비"
                value={`₩${fmt(data.summary.opexAmount ?? 0)}`}
                sub={data.summary.opexByCategory && data.summary.opexByCategory.length > 0
                  ? `${data.summary.opexByCategory.length}개 카테고리`
                  : undefined}
                delta={<DeltaBadge curr={data.summary.opexAmount ?? 0} prev={data.prevSummary.opexAmount ?? 0} />}
              />
              <SummaryCard
                title="실순이익"
                value={`₩${fmt(data.summary.netProfit)}`}
                sub={`마진율 ${data.summary.marginRate.toFixed(1)}%`}
                delta={<DeltaBadge curr={data.summary.netProfit} prev={data.prevSummary.netProfit} />}
                highlight
              />
            </div>

            <div className="text-jm-xs text-[var(--jm-text-muted)]">
              기준 기간: {format(new Date(data.period.from), "yyyy-MM-dd")} ~ {format(new Date(data.period.to), "yyyy-MM-dd")}
              ({data.summary.orderCount}건 / {data.summary.itemCount}품목)
            </div>

            {/* 채널별 합계 */}
            {data.channelGroups.length > 0 && (
              <JmCard>
                <JmCardHeader className="flex flex-row items-center justify-between">
                  <JmCardTitle className="text-jm-base">채널별 합계</JmCardTitle>
                  <JmButton variant="outline" size="xs" className="gap-1.5" onClick={() => handleExport("channels")}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </JmButton>
                </JmCardHeader>
                <JmCardContent className="p-0">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>채널</JmTableHead>
                        <JmTableHead className="text-right">주문수</JmTableHead>
                        <JmTableHead className="text-right">매출(공급가)</JmTableHead>
                        <JmTableHead className="text-right">원가</JmTableHead>
                        <JmTableHead className="text-right">수수료</JmTableHead>
                        <JmTableHead className="text-right">카드료</JmTableHead>
                        <JmTableHead className="text-right">실순이익</JmTableHead>
                        <JmTableHead className="text-right">마진율</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {data.channelGroups.map((g) => (
                        <JmTableRow key={g.channelId ?? "__offline__"}>
                          <JmTableCell className="text-jm-xs font-medium">{g.channelName}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-jm-xs">{g.orderCount}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.supplyRevenue)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.costAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.commissionAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">{g.cardFeeAmount > 0 ? `₩${fmt(g.cardFeeAmount)}` : "—"}</JmTableCell>
                          <JmTableCell className={`text-right tabular-nums font-semibold ${g.netProfit >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            ₩{fmt(g.netProfit)}
                          </JmTableCell>
                          <JmTableCell className={`text-right tabular-nums ${g.marginRate >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            {g.marginRate.toFixed(1)}%
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                </JmCardContent>
              </JmCard>
            )}

            {/* 카테고리별 합계 */}
            {data.categoryGroups && data.categoryGroups.length > 0 && (
              <JmCard>
                <JmCardHeader className="flex flex-row items-center justify-between">
                  <JmCardTitle className="text-jm-base">카테고리별 합계</JmCardTitle>
                  <JmButton variant="outline" size="xs" className="gap-1.5" onClick={() => handleExport("categories")}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </JmButton>
                </JmCardHeader>
                <JmCardContent className="p-0">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>카테고리</JmTableHead>
                        <JmTableHead className="text-right">판매수량</JmTableHead>
                        <JmTableHead className="text-right">매출(공급가)</JmTableHead>
                        <JmTableHead className="text-right">원가</JmTableHead>
                        <JmTableHead className="text-right">수수료</JmTableHead>
                        <JmTableHead className="text-right">배송원가</JmTableHead>
                        <JmTableHead className="text-right">실순이익</JmTableHead>
                        <JmTableHead className="text-right">마진율</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {data.categoryGroups.map((g) => (
                        <JmTableRow key={g.categoryId ?? "__none__"}>
                          <JmTableCell className="text-jm-xs font-medium">{g.categoryName}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums text-jm-xs">{g.quantity}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.supplyRevenue)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.costAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(g.commissionAmount + g.cardFeeAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">{g.shippingCostAmount > 0 ? `₩${fmt(g.shippingCostAmount)}` : "—"}</JmTableCell>
                          <JmTableCell className={`text-right tabular-nums font-semibold ${g.netProfit >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            ₩{fmt(g.netProfit)}
                          </JmTableCell>
                          <JmTableCell className={`text-right tabular-nums ${g.marginRate >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            {g.marginRate.toFixed(1)}%
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                </JmCardContent>
              </JmCard>
            )}

            {/* 상품 TOP 10 */}
            {data.productGroups.length > 0 && (
              <JmCard>
                <JmCardHeader className="flex flex-row items-center justify-between gap-2">
                  <JmCardTitle className="text-jm-base">상품 TOP 10</JmCardTitle>
                  <div className="flex items-center gap-2">
                    <JmSelect
                      variant="pill"
                      size="sm"
                      options={TOP_SORT_OPTIONS}
                      value={topSort}
                      onChange={(v) => setTopSort((v ?? "revenue") as TopProductSort)}
                    />
                    <JmButton variant="outline" size="xs" className="gap-1.5" onClick={() => handleExport("products")}>
                      <Download className="h-3.5 w-3.5" /> CSV
                    </JmButton>
                  </div>
                </JmCardHeader>
                <JmCardContent className="p-0">
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>순위</JmTableHead>
                        <JmTableHead>상품</JmTableHead>
                        <JmTableHead>규격</JmTableHead>
                        <JmTableHead>SKU</JmTableHead>
                        <JmTableHead className="text-right">판매수량</JmTableHead>
                        <JmTableHead className="text-right">매출(공급가)</JmTableHead>
                        <JmTableHead className="text-right">원가</JmTableHead>
                        <JmTableHead className="text-right">배송원가</JmTableHead>
                        <JmTableHead className="text-right">실순이익</JmTableHead>
                        <JmTableHead className="text-right">마진율</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {[...data.productGroups]
                        .sort((a, b) => topSort === "revenue" ? b.supplyRevenue - a.supplyRevenue : b.netProfit - a.netProfit)
                        .slice(0, 10)
                        .map((p, idx) => (
                          <JmTableRow key={p.productId}>
                            <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)] tabular-nums">{idx + 1}</JmTableCell>
                            <JmTableCell className="text-jm-xs font-medium">{p.productName}</JmTableCell>
                            <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">{p.spec ?? "-"}</JmTableCell>
                            <JmTableCell className="text-jm-xs text-[var(--jm-text-muted)]">{p.sku}</JmTableCell>
                            <JmTableCell className="text-right tabular-nums text-jm-xs">{p.quantity}</JmTableCell>
                            <JmTableCell className="text-right tabular-nums">₩{fmt(p.supplyRevenue)}</JmTableCell>
                            <JmTableCell className="text-right tabular-nums">₩{fmt(p.costAmount)}</JmTableCell>
                            <JmTableCell className="text-right tabular-nums">{p.shippingCostAmount > 0 ? `₩${fmt(p.shippingCostAmount)}` : "—"}</JmTableCell>
                            <JmTableCell className={`text-right tabular-nums font-semibold ${p.netProfit >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                              ₩{fmt(p.netProfit)}
                            </JmTableCell>
                            <JmTableCell className={`text-right tabular-nums ${p.marginRate >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                              {p.marginRate.toFixed(1)}%
                            </JmTableCell>
                          </JmTableRow>
                        ))}
                    </JmTableBody>
                  </JmTable>
                </JmCardContent>
              </JmCard>
            )}

            {/* 주문별 리스트 */}
            <JmCard>
              <JmCardHeader className="flex flex-row items-center justify-between">
                <JmCardTitle className="text-jm-base">주문별 마진</JmCardTitle>
                <JmButton variant="outline" size="xs" className="gap-1.5" onClick={() => handleExport("orders")}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </JmButton>
              </JmCardHeader>
              <JmCardContent className="p-0">
                {data.orders.length === 0 ? (
                  <p className="px-6 py-8 text-center text-[var(--jm-text-muted)] text-jm-sm">해당 기간에 확정된 주문이 없습니다.</p>
                ) : (
                  <JmTable>
                    <JmTableHeader>
                      <JmTableRow>
                        <JmTableHead>주문일</JmTableHead>
                        <JmTableHead>주문번호</JmTableHead>
                        <JmTableHead>채널</JmTableHead>
                        <JmTableHead className="text-right">매출(공급가)</JmTableHead>
                        <JmTableHead className="text-right">원가</JmTableHead>
                        <JmTableHead className="text-right">수수료</JmTableHead>
                        <JmTableHead className="text-right">카드료</JmTableHead>
                        <JmTableHead className="text-right">배송원가</JmTableHead>
                        <JmTableHead className="text-right">실순이익</JmTableHead>
                        <JmTableHead className="text-right">마진율</JmTableHead>
                      </JmTableRow>
                    </JmTableHeader>
                    <JmTableBody>
                      {data.orders.map((o) => (
                        <JmTableRow key={o.id}>
                          <JmTableCell className="text-jm-xs">{format(new Date(o.orderDate), "yyyy-MM-dd")}</JmTableCell>
                          <JmTableCell className="text-jm-xs">{o.orderNo}</JmTableCell>
                          <JmTableCell className="text-jm-xs">{o.channelName}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(o.supplyRevenue)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(o.costAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">₩{fmt(o.commissionAmount)}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">{o.cardFeeAmount > 0 ? `₩${fmt(o.cardFeeAmount)}` : "—"}</JmTableCell>
                          <JmTableCell className="text-right tabular-nums">{o.shippingCostAmount && o.shippingCostAmount > 0 ? `₩${fmt(o.shippingCostAmount)}` : "—"}</JmTableCell>
                          <JmTableCell className={`text-right tabular-nums font-semibold ${o.netProfit >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            ₩{fmt(o.netProfit)}
                          </JmTableCell>
                          <JmTableCell className={`text-right tabular-nums ${o.marginRate >= 0 ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-danger-fg)]"}`}>
                            {o.marginRate.toFixed(1)}%
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </JmTableBody>
                  </JmTable>
                )}
              </JmCardContent>
            </JmCard>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title, value, sub, delta, highlight,
}: {
  title: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 space-y-1 ${highlight ? "border-[var(--jm-success-fg)]/40 bg-[var(--jm-success-bg)]" : "border-[var(--jm-border)] bg-[var(--jm-surface)]"}`}>
      <div className="text-jm-2xs text-[var(--jm-text-muted)]">{title}</div>
      <div className={`text-jm-md font-bold tabular-nums ${highlight ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text)]"}`}>{value}</div>
      {sub && <div className="text-jm-2xs text-[var(--jm-text-muted)] tabular-nums">{sub}</div>}
      {delta}
    </div>
  );
}
