"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { toCSV, downloadCSV } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  quantity: number;
  revenue: number;
  supplyRevenue: number;
  costAmount: number;
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
  if (sign === "flat") return <span className="text-[11px] text-muted-foreground">— vs 이전</span>;
  const color = sign === "up" ? "text-primary" : "text-red-400";
  const arrow = sign === "up" ? "▲" : "▼";
  return (
    <span className={`text-[11px] tabular-nums ${color}`}>
      {arrow} {value.toFixed(1)}% vs 이전
    </span>
  );
}

type TopProductSort = "revenue" | "netProfit";

export default function MarginReportPage() {
  const [period, setPeriod] = useState<PeriodKey>("this-month");
  const [channelId, setChannelId] = useState<string>("all");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [topSort, setTopSort] = useState<TopProductSort>("revenue");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodRange(period);
    const qs = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    if (channelId !== "all") qs.set("channelId", channelId);
    const res = await fetch(`/api/reports/margin?${qs}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [period, channelId]);

  useEffect(() => {
    fetch("/api/channels").then((r) => r.json()).then(setChannels).catch(() => {});
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        { key: "sku", label: "SKU" },
        { key: "quantity", label: "판매수량" },
        { key: "revenue", label: "매출(VAT포함)" },
        { key: "supplyRevenue", label: "공급가매출" },
        { key: "costAmount", label: "원가" },
        { key: "netProfit", label: "실순이익" },
        { key: "marginRate", label: "마진율(%)" },
      ]);
      filename = `margin-products-${fromStr}_${toStr}.csv`;
    }
    downloadCSV(filename, csv);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">마진 리포트</h2>
          <p className="text-[13px] text-muted-foreground">매출 시점의 실제 원가·수수료를 반영한 실순이익 분석</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="!h-9 w-[120px]">
              <span>
                {period === "this-month" ? "이번 달"
                  : period === "last-month" ? "전월"
                  : period === "last-7d" ? "최근 7일"
                  : "최근 30일"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">이번 달</SelectItem>
              <SelectItem value="last-month">전월</SelectItem>
              <SelectItem value="last-7d">최근 7일</SelectItem>
              <SelectItem value="last-30d">최근 30일</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelId} onValueChange={(v) => setChannelId(v ?? "all")}>
            <SelectTrigger className="!h-9 w-[140px]">
              <span>{channelId === "all" ? "전체 채널" : channels.find((c) => c.id === channelId)?.name ?? "전체 채널"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 채널</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <>
          {/* 원가 정보 누락 경고 */}
          {data.missingCostCount && data.missingCostCount > 0 ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-700 dark:text-yellow-400">
              ⚠️ {data.missingCostCount}건의 주문 항목에 원가 정보가 누락되어 마진이 과대 표시될 수 있습니다.
              {data.missingCostOrderIds && data.missingCostOrderIds.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (관련 주문 {data.missingCostOrderIds.length}건)
                </span>
              )}
            </div>
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

          <div className="text-[12px] text-muted-foreground">
            기준 기간: {format(new Date(data.period.from), "yyyy-MM-dd")} ~ {format(new Date(data.period.to), "yyyy-MM-dd")}
            ({data.summary.orderCount}건 / {data.summary.itemCount}품목)
          </div>

          {/* 채널별 합계 */}
          {data.channelGroups.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">채널별 합계</CardTitle>
                <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => handleExport("channels")}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>채널</TableHead>
                      <TableHead className="text-right">주문수</TableHead>
                      <TableHead className="text-right">매출</TableHead>
                      <TableHead className="text-right">원가</TableHead>
                      <TableHead className="text-right">수수료</TableHead>
                      <TableHead className="text-right">카드료</TableHead>
                      <TableHead className="text-right">실순이익</TableHead>
                      <TableHead className="text-right">마진율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.channelGroups.map((g) => (
                      <TableRow key={g.channelId ?? g.channelName}>
                        <TableCell className="text-[12px] font-medium">{g.channelName}</TableCell>
                        <TableCell className="text-right tabular-nums text-[12px]">{g.orderCount}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.costAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.commissionAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{g.cardFeeAmount > 0 ? `₩${fmt(g.cardFeeAmount)}` : "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${g.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                          ₩{fmt(g.netProfit)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${g.marginRate >= 0 ? "text-primary" : "text-red-400"}`}>
                          {g.marginRate.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 카테고리별 합계 */}
          {data.categoryGroups && data.categoryGroups.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">카테고리별 합계</CardTitle>
                <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => handleExport("categories")}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>카테고리</TableHead>
                      <TableHead className="text-right">판매수량</TableHead>
                      <TableHead className="text-right">매출</TableHead>
                      <TableHead className="text-right">원가</TableHead>
                      <TableHead className="text-right">수수료</TableHead>
                      <TableHead className="text-right">실순이익</TableHead>
                      <TableHead className="text-right">마진율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.categoryGroups.map((g) => (
                      <TableRow key={g.categoryId ?? "__none__"}>
                        <TableCell className="text-[12px] font-medium">{g.categoryName}</TableCell>
                        <TableCell className="text-right tabular-nums text-[12px]">{g.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.costAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(g.commissionAmount + g.cardFeeAmount)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${g.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                          ₩{fmt(g.netProfit)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${g.marginRate >= 0 ? "text-primary" : "text-red-400"}`}>
                          {g.marginRate.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 상품 TOP 10 */}
          {data.productGroups.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">상품 TOP 10</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={topSort} onValueChange={(v) => setTopSort((v ?? "revenue") as TopProductSort)}>
                    <SelectTrigger className="!h-8 w-[120px] text-[12px]">
                      <span>{topSort === "revenue" ? "매출 기준" : "실수익 기준"}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">매출 기준</SelectItem>
                      <SelectItem value="netProfit">실수익 기준</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => handleExport("products")}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>순위</TableHead>
                      <TableHead>상품</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">판매수량</TableHead>
                      <TableHead className="text-right">매출</TableHead>
                      <TableHead className="text-right">원가</TableHead>
                      <TableHead className="text-right">실순이익</TableHead>
                      <TableHead className="text-right">마진율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.productGroups]
                      .sort((a, b) => topSort === "revenue" ? b.revenue - a.revenue : b.netProfit - a.netProfit)
                      .slice(0, 10)
                      .map((p, idx) => (
                        <TableRow key={p.productId}>
                          <TableCell className="text-[12px] text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                          <TableCell className="text-[12px] font-medium">{p.productName}</TableCell>
                          <TableCell className="text-[12px] text-muted-foreground">{p.sku}</TableCell>
                          <TableCell className="text-right tabular-nums text-[12px]">{p.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">₩{fmt(p.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">₩{fmt(p.costAmount)}</TableCell>
                          <TableCell className={`text-right tabular-nums font-semibold ${p.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                            ₩{fmt(p.netProfit)}
                          </TableCell>
                          <TableCell className={`text-right tabular-nums ${p.marginRate >= 0 ? "text-primary" : "text-red-400"}`}>
                            {p.marginRate.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 주문별 리스트 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">주문별 마진</CardTitle>
              <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1.5" onClick={() => handleExport("orders")}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {data.orders.length === 0 ? (
                <p className="px-6 py-8 text-center text-muted-foreground text-[13px]">해당 기간에 확정된 주문이 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>주문일</TableHead>
                      <TableHead>주문번호</TableHead>
                      <TableHead>채널</TableHead>
                      <TableHead className="text-right">매출</TableHead>
                      <TableHead className="text-right">원가</TableHead>
                      <TableHead className="text-right">수수료</TableHead>
                      <TableHead className="text-right">카드료</TableHead>
                      <TableHead className="text-right">실순이익</TableHead>
                      <TableHead className="text-right">마진율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-[12px]">{format(new Date(o.orderDate), "yyyy-MM-dd")}</TableCell>
                        <TableCell className="text-[12px]">{o.orderNo}</TableCell>
                        <TableCell className="text-[12px]">{o.channelName}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(o.revenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(o.costAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">₩{fmt(o.commissionAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.cardFeeAmount > 0 ? `₩${fmt(o.cardFeeAmount)}` : "—"}</TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold ${o.netProfit >= 0 ? "text-primary" : "text-red-400"}`}>
                          ₩{fmt(o.netProfit)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${o.marginRate >= 0 ? "text-primary" : "text-red-400"}`}>
                          {o.marginRate.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
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
    <div className={`rounded-lg border p-3 space-y-1 ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[11px] text-muted-foreground">{title}</div>
      <div className={`text-[15px] font-bold tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>}
      {delta}
    </div>
  );
}
