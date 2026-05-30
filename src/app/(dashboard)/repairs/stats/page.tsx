"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Wrench,
  CheckCircle,
  XCircle,
  Activity,
  TrendingUp,
  Download,
  Clock,
  Printer,
  PackageX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { format, startOfMonth, startOfWeek, startOfYear, subDays } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiGet } from "@/lib/api-client";
import {
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmIconButton,
  JmInput,
  JmSegmentedControl,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

const Card = JmCard;
const CardContent = JmCardContent;
const CardHeader = JmCardHeader;
const CardTitle = JmCardTitle;
const Skeleton = JmSkeleton;
const Input = JmInput;
const Table = JmTable;
const TableBody = JmTableBody;
const TableCell = JmTableCell;
const TableHead = JmTableHead;
const TableHeader = JmTableHeader;
const TableRow = JmTableRow;

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "접수",
  DIAGNOSING: "진단중",
  QUOTED: "견적대기",
  APPROVED: "승인",
  REPAIRING: "수리중",
  READY: "인계대기",
  PICKED_UP: "수리완료",
  CANCELLED: "취소",
};

const CANCEL_REASON_LABEL: Record<string, string> = {
  CUSTOMER_DECLINED: "손님 거절",
  CUSTOMER_NO_SHOW: "손님 미반환",
  SHOP_GAVE_UP: "매장 포기",
  PARTS_UNAVAILABLE: "부속 수급 불가",
  SOLD_AS_PRODUCT: "상품 구매로 전환",
  MISTAKE: "잘못 생성",
  OTHER: "기타",
};

const QUOTE_REJECT_REASON_LABEL: Record<string, string> = {
  TOO_EXPENSIVE: "가격 부담",
  NOT_WORTH_IT: "가성비 문제",
  WILL_SHOP_AROUND: "다른 매장 비교",
  CHANGED_MIND: "단순 변심",
  PARTS_UNAVAILABLE: "부속 수급 불가",
  SHOP_DECLINED: "매장 포기",
  OTHER: "기타",
};

const PIE_COLORS = [
  "var(--jm-success-solid)",
  "var(--jm-info-solid)",
  "var(--jm-warning-solid)",
  "var(--jm-danger-solid)",
  "var(--jm-action)",
  "var(--jm-text-muted)",
  "var(--jm-text-subtle)",
];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--jm-surface)",
  border: "1px solid var(--jm-border)",
  borderRadius: "0.5rem",
  fontSize: 12,
  color: "var(--jm-text)",
} as const;

interface ProductStat {
  productId: string | null;
  productName: string;
  sku: string;
  count: number;
  failures: number;
  failureRate: number;
  /** 회사 손실 LOST 부속 합계 (billLost=false 분만) */
  lostCost: number;
  /** 평균 처리 기간 (PICKED_UP, receivedAt → pickedUpAt) */
  avgDays: number | null;
}

interface CategoryStat {
  categoryId: string | null;
  categoryName: string;
  count: number;
  avgDays: number | null;
  completedCount: number;
}

interface AssigneeStat {
  assigneeId: string | null;
  assigneeName: string;
  count: number;
  avgDays: number | null;
}

interface Stats {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  byStatus: { status: string; count: number }[];
  byCancelReason: { reason: string | null; count: number }[];
  quoteRejection: {
    byReason: { reason: string | null; count: number }[];
    quotedCount: number;
    rejectedCount: number;
    rejectedRevenue: number;
    rejectedPaidCount: number;
    avgQuotedAmount: number;
  };
  byCategory: CategoryStat[];
  byProduct: ProductStat[];
  avgRepairDays: { avgDays: number | null; completedCount: number };
  revenueByMonth: { month: string; revenue: string; count: number }[];
  byAssignee: AssigneeStat[];
  soldAsProductByMonth: { month: string; count: number }[];
  lostParts: {
    /** 회사 부담 LOST 합계 (billLost=false). 청구된 LOST 는 매출이라 별개 */
    totalCost: number;
    count: number;
    byMonth: { month: string; cost: number; count: number }[];
  };
  byCustomerType: {
    type: string;
    count: number;
    revenue: number;
  }[];
}

type RangePreset = "ALL" | "THIS_WEEK" | "THIS_MONTH" | "THIS_YEAR" | "LAST_30D" | "CUSTOM";

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "THIS_WEEK", label: "이번 주" },
  { value: "THIS_MONTH", label: "이번 달" },
  { value: "LAST_30D", label: "최근 30일" },
  { value: "THIS_YEAR", label: "올해" },
  { value: "CUSTOM", label: "직접 선택" },
];

function presetToRange(preset: RangePreset): { from: string; to: string } {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  if (preset === "THIS_WEEK") {
    return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "THIS_MONTH") {
    return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "LAST_30D") {
    return { from: format(subDays(today, 30), "yyyy-MM-dd"), to: todayStr };
  }
  if (preset === "THIS_YEAR") {
    return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
  }
  return { from: "", to: "" };
}

interface CategoryOption {
  id: string;
  name: string;
}

export default function RepairStatsPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // 상품 ranking 전용 카테고리 필터 ("" = 전체, "__none__" = 기타)
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("");

  const range = useMemo(() => {
    if (preset === "CUSTOM") return { from: customFrom, to: customTo };
    if (preset === "ALL") return { from: "", to: "" };
    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  const categoriesQuery = useQuery<CategoryOption[]>({
    queryKey: ["categories", "for-stats"],
    queryFn: () => apiGet<CategoryOption[]>("/api/categories"),
    staleTime: 1000 * 60 * 5,
  });

  const statsQuery = useQuery<Stats>({
    queryKey: ["repairs", "stats", range.from, range.to, productCategoryFilter],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (range.from) sp.set("from", range.from);
      if (range.to) sp.set("to", range.to);
      if (productCategoryFilter)
        sp.set("productRankingCategoryId", productCategoryFilter);
      const qs = sp.toString();
      return apiGet<Stats>(`/api/repair-tickets/stats${qs ? `?${qs}` : ""}`);
    },
    staleTime: 1000 * 30,
  });

  const stats = statsQuery.data;
  const completionRate = stats && stats.total > 0
    ? ((stats.completed / stats.total) * 100).toFixed(1)
    : "0";
  const cancelRate = stats && stats.total > 0
    ? ((stats.cancelled / stats.total) * 100).toFixed(1)
    : "0";
  const soldAsProductCount =
    stats?.byCancelReason.find((r) => r.reason === "SOLD_AS_PRODUCT")?.count ?? 0;
  const conversionRate = stats && stats.cancelled > 0
    ? ((soldAsProductCount / stats.cancelled) * 100).toFixed(1)
    : "0";

  // 차트 데이터 — 시간 역순 → 정순 (시계열은 좌→우)
  const monthlyTrend = useMemo(
    () =>
      (stats?.soldAsProductByMonth ?? [])
        .slice()
        .reverse()
        .map((r) => ({ month: r.month.slice(2), count: r.count })),
    [stats?.soldAsProductByMonth],
  );
  const cancelReasonChart = useMemo(
    () =>
      (stats?.byCancelReason ?? []).map((r) => ({
        name: r.reason ? CANCEL_REASON_LABEL[r.reason] ?? r.reason : "(미지정)",
        value: r.count,
      })),
    [stats?.byCancelReason],
  );
  const quoteRejectChart = useMemo(
    () =>
      (stats?.quoteRejection.byReason ?? []).map((r) => ({
        name: r.reason
          ? QUOTE_REJECT_REASON_LABEL[r.reason] ?? r.reason
          : "(미지정)",
        value: r.count,
      })),
    [stats?.quoteRejection.byReason],
  );
  const categoryChart = useMemo(
    () =>
      (stats?.byCategory ?? [])
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((r) => ({ name: r.categoryName, count: r.count })),
    [stats?.byCategory],
  );
  const revenueChart = useMemo(
    () =>
      (stats?.revenueByMonth ?? []).map((r) => ({
        month: r.month.slice(2),
        revenue: Math.round(Number(r.revenue) / 1000), // 천원 단위
        count: r.count,
      })),
    [stats?.revenueByMonth],
  );
  const totalRevenue = useMemo(
    () =>
      (stats?.revenueByMonth ?? []).reduce(
        (sum, r) => sum + Number(r.revenue),
        0,
      ),
    [stats?.revenueByMonth],
  );

  const downloadCsv = () => {
    const sp = new URLSearchParams();
    if (range.from) sp.set("from", range.from);
    if (range.to) sp.set("to", range.to);
    const qs = sp.toString();
    window.location.href = `/api/repair-tickets/export${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-5 py-3">
        <JmIconButton
          variant="ghost"
          size="sm"
          onClick={() => router.push("/repairs")}
          aria-label="뒤로"
        >
          <ChevronLeft className="size-4" />
        </JmIconButton>
        <h1 className="text-jm-lg font-semibold text-[var(--jm-text)]">수리 통계</h1>
        <div className="ml-auto flex gap-2 print:hidden">
          <JmButton
            variant="outline"
            size="xs"
            className="gap-1.5"
            onClick={() => window.print()}
          >
            <Printer className="size-3.5" />
            PDF / 인쇄
          </JmButton>
          <JmButton
            variant="outline"
            size="xs"
            className="gap-1.5"
            onClick={downloadCsv}
          >
            <Download className="size-3.5" />
            CSV
          </JmButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* 기간 필터 — 인쇄 시 숨기고 선택 범위만 표시 */}
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <JmSegmentedControl<RangePreset>
            options={RANGE_PRESETS}
            value={preset}
            onChange={setPreset}
            ariaLabel="기간 선택"
          />
          {preset === "CUSTOM" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                size="sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-jm-xs text-[var(--jm-text-muted)]">~</span>
              <Input
                type="date"
                size="sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[140px]"
              />
            </div>
          )}
          {range.from && range.to && (
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              {range.from} ~ {range.to}
            </span>
          )}
        </div>
        {/* 인쇄 전용 헤더 — 화면에선 숨김 */}
        <div className="mb-4 hidden print:block">
          <h2 className="text-jm-2xl font-bold text-[var(--jm-text)]">수리 통계 리포트</h2>
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            기간: {range.from && range.to ? `${range.from} ~ ${range.to}` : "전체"}
            {" · "}
            출력일: {format(new Date(), "yyyy-MM-dd HH:mm")}
          </p>
        </div>

        {statsQuery.isPending ? (
          <StatsSkeleton />
        ) : !stats ? (
          <div className="text-jm-sm text-[var(--jm-text-muted)]">통계를 불러올 수 없습니다</div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* KPI 카드 */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard
                icon={<Wrench className="size-4" />}
                label="총 수리"
                value={stats.total.toLocaleString("ko-KR")}
                hint="기간 내"
              />
              <KpiCard
                icon={<Activity className="size-4" />}
                label="진행중"
                value={stats.active.toLocaleString("ko-KR")}
                tone="active"
              />
              <KpiCard
                icon={<CheckCircle className="size-4" />}
                label="완료"
                value={stats.completed.toLocaleString("ko-KR")}
                hint={`완료율 ${completionRate}%`}
                tone="success"
              />
              <KpiCard
                icon={<XCircle className="size-4" />}
                label="취소"
                value={stats.cancelled.toLocaleString("ko-KR")}
                hint={`취소율 ${cancelRate}%`}
                tone="danger"
              />
              <KpiCard
                icon={<TrendingUp className="size-4" />}
                label="상품 전환"
                value={soldAsProductCount.toLocaleString("ko-KR")}
                hint={`취소 중 ${conversionRate}%`}
                tone="info"
              />
              <KpiCard
                icon={<Clock className="size-4" />}
                label="평균 수리 기간"
                value={
                  stats.avgRepairDays.avgDays != null
                    ? `${stats.avgRepairDays.avgDays.toFixed(1)}일`
                    : "—"
                }
                hint={`완료 ${stats.avgRepairDays.completedCount.toLocaleString("ko-KR")}건`}
              />
              <KpiCard
                icon={<PackageX className="size-4" />}
                label="LOST 회사 부담"
                value={`₩${stats.lostParts.totalCost.toLocaleString("ko-KR")}`}
                hint={`${stats.lostParts.count.toLocaleString("ko-KR")}개 부속`}
                tone="danger"
              />
            </div>

            {/* 차트 — 카테고리 막대 + 취소사유 파이 (2열) */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card className="stats-print-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-jm-sm">카테고리별 빈도 (top 10)</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {categoryChart.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryChart} layout="vertical" margin={{ left: 60 }}>
                        <CartesianGrid stroke="var(--jm-border)" strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} />
                        <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} />
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Bar dataKey="count" fill="var(--jm-info-solid)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card className="stats-print-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-jm-sm">취소 사유 분포</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {cancelReasonChart.length === 0 ? (
                    <EmptyChart hint="취소된 수리 없음" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={cancelReasonChart}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={80}
                          label={(entry) => `${entry.name} ${entry.value}`}
                          labelLine={false}
                        >
                          {cancelReasonChart.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 거절 견적 분석 — 진단비만 청구한 케이스. 가격 정책/마진 피드백용 */}
            {stats && stats.quoteRejection.rejectedCount > 0 && (
              <Card className="stats-print-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-jm-sm">
                    견적 거절 분석 — 진단비만 청구
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div className="flex flex-col gap-2">
                    <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">거절 건수 / 견적 발생</div>
                      <div className="mt-0.5 text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                        {stats.quoteRejection.rejectedCount} / {stats.quoteRejection.quotedCount}
                      </div>
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">
                        거절률{" "}
                        <span className="font-semibold text-[var(--jm-text)]">
                          {stats.quoteRejection.quotedCount > 0
                            ? (
                                (stats.quoteRejection.rejectedCount /
                                  stats.quoteRejection.quotedCount) *
                                100
                              ).toFixed(1)
                            : "0"}
                          %
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">거절 매출 (진단비)</div>
                      <div className="mt-0.5 text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                        ₩
                        {Math.round(
                          stats.quoteRejection.rejectedRevenue,
                        ).toLocaleString("ko-KR")}
                      </div>
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">
                        결제 완료{" "}
                        <span className="font-semibold text-[var(--jm-text)]">
                          {stats.quoteRejection.rejectedPaidCount}
                        </span>
                        건
                      </div>
                    </div>
                    <div className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">평균 거절 견적가</div>
                      <div className="mt-0.5 text-jm-lg font-bold tabular-nums text-[var(--jm-text)]">
                        ₩
                        {Math.round(
                          stats.quoteRejection.avgQuotedAmount,
                        ).toLocaleString("ko-KR")}
                      </div>
                      <div className="text-jm-xs text-[var(--jm-text-muted)]">
                        어느 가격대에서 거절이 자주 나는지 추적
                      </div>
                    </div>
                  </div>
                  <div className="h-64">
                    {quoteRejectChart.length === 0 ? (
                      <EmptyChart hint="거절 사유 데이터 없음" />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={quoteRejectChart}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={90}
                            label={(entry) => `${entry.name} ${entry.value}`}
                            labelLine={false}
                          >
                            {quoteRejectChart.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 상품 전환 월별 추이 — 라인 */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-jm-sm">
                  상품 구매로 전환 — 최근 12개월 추이
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                {monthlyTrend.length === 0 ? (
                  <EmptyChart hint="전환 사례가 쌓이면 표시됩니다" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyTrend}>
                      <CartesianGrid stroke="var(--jm-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="var(--jm-warning-solid)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 고객 type 별 수리 분포 + 매출 */}
            {stats.byCustomerType && stats.byCustomerType.length > 0 && (
              <Card className="stats-print-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-jm-sm">고객 분류별 수리</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {stats.byCustomerType.map((g) => {
                      const label =
                        g.type === "BUSINESS"
                          ? "기업"
                          : g.type === "INDIVIDUAL"
                            ? "개인"
                            : "미등록";
                      const tone =
                        g.type === "BUSINESS"
                          ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)] border-[color-mix(in_oklch,var(--jm-warning-solid)_35%,transparent)]"
                          : g.type === "INDIVIDUAL"
                            ? "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)] border-[color-mix(in_oklch,var(--jm-success-solid)_35%,transparent)]"
                            : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] border-[var(--jm-border)]";
                      const totalCount = stats.byCustomerType.reduce(
                        (s, x) => s + x.count,
                        0,
                      );
                      const pct =
                        totalCount > 0 ? (g.count / totalCount) * 100 : 0;
                      return (
                        <div
                          key={g.type}
                          className={`flex flex-col gap-1 rounded-xl border p-3 ${tone}`}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-jm-xs font-semibold">
                              {label}
                            </span>
                            <span className="text-jm-2xs tabular-nums opacity-70">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="text-jm-xl font-bold tabular-nums">
                            {g.count.toLocaleString("ko-KR")}건
                          </div>
                          {g.revenue > 0 && (
                            <div className="text-jm-2xs tabular-nums opacity-70">
                              매출 ₩{g.revenue.toLocaleString("ko-KR")}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 카테고리별 평균 처리 기간 + 건수 ranking */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-jm-sm">
                  카테고리별 평균 처리 기간 — 어떤 카테고리가 빠르게/느리게 끝나는지
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byCategory.length === 0 ? (
                  <p className="py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    데이터 없음
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>카테고리</TableHead>
                        <TableHead className="text-right">전체 건수</TableHead>
                        <TableHead className="text-right">완료 건수</TableHead>
                        <TableHead className="text-right">평균 처리 기간</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byCategory
                        .slice()
                        .sort((a, b) => {
                          // avgDays 있는 것 먼저, 그 안에서 desc (느린 것이 위로)
                          if (a.avgDays == null && b.avgDays == null) return 0;
                          if (a.avgDays == null) return 1;
                          if (b.avgDays == null) return -1;
                          return b.avgDays - a.avgDays;
                        })
                        .map((c) => (
                          <TableRow key={c.categoryId ?? "none"}>
                            <TableCell className="font-medium">
                              {c.categoryName}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.count.toLocaleString("ko-KR")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                              {c.completedCount.toLocaleString("ko-KR")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {c.avgDays != null ? (
                                <span
                                  className={
                                    c.avgDays >= 7
                                      ? "font-semibold text-[var(--jm-warning-fg)]"
                                      : c.avgDays >= 3
                                        ? "text-[var(--jm-text)]"
                                        : "text-[var(--jm-success-fg)]"
                                  }
                                >
                                  {c.avgDays.toFixed(1)}일
                                </span>
                              ) : (
                                <span className="text-[var(--jm-text-muted)]">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 월별 수리 매출 — 막대 차트 */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-jm-sm">
                  월별 수리 매출 — 총 ₩{totalRevenue.toLocaleString("ko-KR")}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                {revenueChart.length === 0 ? (
                  <EmptyChart hint="완료된 수리 매출이 쌓이면 표시됩니다" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueChart}>
                      <CartesianGrid stroke="var(--jm-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--jm-text-muted)" }} unit="천" />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value) =>
                          `₩${(Number(value) * 1000).toLocaleString("ko-KR")}`
                        }
                      />
                      <Bar
                        dataKey="revenue"
                        fill="var(--jm-success-solid)"
                        radius={[4, 4, 0, 0]}
                        name="매출 (천원)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* 담당자별 처리 ranking */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-jm-sm">
                  담당자별 처리 (top 10) — 완료된 수리 기준
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byAssignee.length === 0 ? (
                  <p className="py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    담당자 지정된 완료 수리가 없습니다
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>담당자</TableHead>
                        <TableHead className="text-right">완료 건수</TableHead>
                        <TableHead className="text-right">평균 처리 기간</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byAssignee.map((a, i) => (
                        <TableRow key={a.assigneeId ?? i}>
                          <TableCell className="text-[var(--jm-text-muted)]">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {a.assigneeName}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.count.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {a.avgDays != null
                              ? `${a.avgDays.toFixed(1)}일`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 상품 ranking — 수리 빈도 + 실패율 */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-jm-sm">
                    상품별 수리 빈도 (top 20) — 실패율 = 매장 포기 + 부속 수급 불가
                  </CardTitle>
                  <JmSelect
                    value={productCategoryFilter}
                    onChange={setProductCategoryFilter}
                    size="sm"
                    align="end"
                    className="w-[180px]"
                    placeholder="카테고리 전체"
                    options={[
                      { value: "", label: "카테고리 전체" },
                      { value: "__none__", label: "기타 (미지정)" },
                      ...(categoriesQuery.data ?? []).map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {stats.byProduct.length === 0 ? (
                  <p className="py-6 text-center text-jm-sm text-[var(--jm-text-muted)]">
                    repairProductId 매핑된 수리 ticket 이 없습니다
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>상품</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">수리 건수</TableHead>
                        <TableHead className="text-right">실패</TableHead>
                        <TableHead className="text-right">실패율</TableHead>
                        <TableHead className="text-right">LOST 회사 부담</TableHead>
                        <TableHead className="text-right">평균 기간</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byProduct.map((p, i) => (
                        <TableRow key={p.productId ?? i}>
                          <TableCell className="text-[var(--jm-text-muted)]">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {p.productName}
                          </TableCell>
                          <TableCell className="font-mono text-jm-xs text-[var(--jm-text-muted)]">
                            {p.sku}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.count.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--jm-danger-fg)]">
                            {p.failures.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={
                                p.failureRate >= 30
                                  ? "font-semibold text-[var(--jm-danger-fg)]"
                                  : p.failureRate >= 15
                                    ? "text-[var(--jm-warning-fg)]"
                                    : "text-[var(--jm-text-muted)]"
                              }
                            >
                              {p.failureRate.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.lostCost > 0 ? (
                              <span className="text-[var(--jm-danger-fg)]">
                                ₩{p.lostCost.toLocaleString("ko-KR")}
                              </span>
                            ) : (
                              <span className="text-[var(--jm-text-muted)]">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.avgDays != null ? (
                              <span
                                className={
                                  p.avgDays >= 7
                                    ? "font-semibold text-[var(--jm-warning-fg)]"
                                    : "text-[var(--jm-text-muted)]"
                                }
                              >
                                {p.avgDays.toFixed(1)}일
                              </span>
                            ) : (
                              <span className="text-[var(--jm-text-muted)]">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 상태별 분포 — 보조 표 */}
            <Card className="stats-print-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-jm-sm">상태별 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">건수</TableHead>
                      <TableHead className="text-right">비율</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.byStatus.map((g) => (
                      <TableRow key={g.status}>
                        <TableCell>{STATUS_LABEL[g.status] ?? g.status}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.count.toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                          {stats.total > 0
                            ? ((g.count / stats.total) * 100).toFixed(1)
                            : "0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "danger" | "info" | "active";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--jm-success-fg)]"
      : tone === "danger"
        ? "text-[var(--jm-danger-fg)]"
        : tone === "info"
          ? "text-[var(--jm-warning-fg)]"
          : tone === "active"
            ? "text-[var(--jm-info-fg)]"
            : "text-[var(--jm-text)]";
  return (
    <Card className="stats-print-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5 text-jm-xs text-[var(--jm-text-muted)]">
          {icon}
          <span>{label}</span>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className={`text-jm-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
        {hint && (
          <div className="mt-0.5 text-jm-2xs text-[var(--jm-text-muted)]">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ hint }: { hint?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-jm-xs text-[var(--jm-text-muted)]">
      {hint ?? "데이터 없음"}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="mt-1 h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
