"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { format, startOfMonth, startOfWeek, startOfYear, subDays } from "date-fns";
import {
  ChevronLeft,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Clock,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
const Button = JmButton;
const Input = JmInput;
const Table = JmTable;
const TableBody = JmTableBody;
const TableCell = JmTableCell;
const TableHead = JmTableHead;
const TableHeader = JmTableHeader;
const TableRow = JmTableRow;

const PAYMENT_LABEL: Record<string, string> = {
  CASH: "현금",
  CASH_RECEIPT: "현금영수증",
  CARD: "카드",
  TRANSFER: "계좌이체",
  UNPAID: "외상",
};

const WEEKDAY_LABEL: Record<number, string> = {
  1: "월",
  2: "화",
  3: "수",
  4: "목",
  5: "금",
  6: "토",
  7: "일",
};

const PIE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
];

interface ChannelStat {
  channelId: string;
  channelName: string;
  channelCode: string;
  total: number;
  commission: number;
  net: number;
  count: number;
}

interface Stats {
  kpi: { total: number; count: number; avgOrderValue: number };
  byChannel: ChannelStat[];
  byPayment: {
    paymentMethod: string | null;
    total: number;
    count: number;
  }[];
  byHour: { hour: number; total: number; count: number }[];
  byWeekday: { weekday: number; total: number; count: number }[];
  byMonth: { month: string; total: number; count: number }[];
  topProducts: {
    productId: string | null;
    productName: string;
    sku: string;
    revenue: number;
    qty: number;
    orders: number;
  }[];
  byCustomerType: {
    type: string;
    total: number;
    count: number;
  }[];
  topBusinessCustomers: {
    customerId: string;
    name: string;
    businessNumber: string | null;
    total: number;
    count: number;
  }[];
}

type RangePreset = "ALL" | "THIS_WEEK" | "THIS_MONTH" | "LAST_30D" | "THIS_YEAR" | "CUSTOM";
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
  if (preset === "THIS_WEEK")
    return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: todayStr };
  if (preset === "THIS_MONTH")
    return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayStr };
  if (preset === "LAST_30D") return { from: format(subDays(today, 30), "yyyy-MM-dd"), to: todayStr };
  if (preset === "THIS_YEAR") return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayStr };
  return { from: "", to: "" };
}

export default function SalesStatsPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    if (preset === "CUSTOM") return { from: customFrom, to: customTo };
    if (preset === "ALL") return { from: "", to: "" };
    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  const statsQuery = useQuery<Stats>({
    queryKey: ["orders", "stats", range.from, range.to],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (range.from) sp.set("from", range.from);
      if (range.to) sp.set("to", range.to);
      const qs = sp.toString();
      return apiGet<Stats>(`/api/orders/stats${qs ? `?${qs}` : ""}`);
    },
    staleTime: 1000 * 30,
  });

  const stats = statsQuery.data;

  const channelChart = useMemo(
    () =>
      (stats?.byChannel ?? []).map((c) => ({
        name: c.channelName,
        value: c.total,
      })),
    [stats?.byChannel],
  );
  const paymentChart = useMemo(
    () =>
      (stats?.byPayment ?? []).map((p) => ({
        name: p.paymentMethod ? (PAYMENT_LABEL[p.paymentMethod] ?? p.paymentMethod) : "(미지정)",
        value: p.total,
      })),
    [stats?.byPayment],
  );
  const hourChart = useMemo(
    () =>
      (stats?.byHour ?? []).map((h) => ({
        hour: `${h.hour}시`,
        revenue: Math.round(h.total / 1000), // 천원
      })),
    [stats?.byHour],
  );
  const weekdayChart = useMemo(
    () =>
      (stats?.byWeekday ?? []).map((w) => ({
        day: WEEKDAY_LABEL[w.weekday] ?? String(w.weekday),
        revenue: Math.round(w.total / 1000),
      })),
    [stats?.byWeekday],
  );
  const monthChart = useMemo(
    () =>
      (stats?.byMonth ?? []).map((m) => ({
        month: m.month.slice(2),
        revenue: Math.round(m.total / 1000),
      })),
    [stats?.byMonth],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--jm-border)] px-5 py-3">
        <JmIconButton
          variant="ghost"
          size="sm"
          onClick={() => router.push("/orders")}
          aria-label="뒤로"
        >
          <ChevronLeft className="size-4" />
        </JmIconButton>
        <h1 className="text-lg font-semibold">매출 통계</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* 기간 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex h-[30px] items-center gap-1 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-1 text-jm-sm">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPreset(p.value)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  preset === p.value
                    ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
                    : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "CUSTOM" && (
            <div className="flex items-center gap-1">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-[30px] w-[140px] text-jm-sm"
              />
              <span className="text-jm-xs text-[var(--jm-text-muted)]">~</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-[30px] w-[140px] text-jm-sm"
              />
            </div>
          )}
          {range.from && range.to && (
            <span className="text-jm-2xs text-[var(--jm-text-muted)]">
              {range.from} ~ {range.to}
            </span>
          )}
        </div>

        {statsQuery.isPending ? (
          <SalesSkeleton />
        ) : !stats ? (
          <p className="text-sm text-[var(--jm-text-muted)]">통계 불러올 수 없음</p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* KPI */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <KpiCard
                icon={<Wallet className="size-4" />}
                label="총 매출"
                value={`₩${stats.kpi.total.toLocaleString("ko-KR")}`}
                hint="기간 내 (취소 제외)"
                tone="success"
              />
              <KpiCard
                icon={<ShoppingCart className="size-4" />}
                label="주문 건수"
                value={stats.kpi.count.toLocaleString("ko-KR")}
              />
              <KpiCard
                icon={<TrendingUp className="size-4" />}
                label="평균 객단가"
                value={`₩${Math.round(stats.kpi.avgOrderValue).toLocaleString("ko-KR")}`}
              />
            </div>

            {/* 채널별 + 결제수단별 — 2 파이 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">채널별 매출</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {channelChart.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={channelChart}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={80}
                          label={(entry) =>
                            `${entry.name} ₩${Math.round(Number(entry.value) / 1000).toLocaleString("ko-KR")}천`
                          }
                          labelLine={false}
                        >
                          {channelChart.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            `₩${Number(value).toLocaleString("ko-KR")}`
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">결제수단별 매출</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  {paymentChart.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentChart}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={80}
                          label={(entry) =>
                            `${entry.name} ₩${Math.round(Number(entry.value) / 1000).toLocaleString("ko-KR")}천`
                          }
                          labelLine={false}
                        >
                          {paymentChart.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            `₩${Number(value).toLocaleString("ko-KR")}`
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 시간대별 + 요일별 — 2 막대 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  <Clock className="mr-1 inline size-3.5" />
                  시간대별 매출
                </CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="천" />
                    <Tooltip
                      formatter={(value) =>
                        `₩${(Number(value) * 1000).toLocaleString("ko-KR")}`
                      }
                    />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">요일별 매출</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayChart}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="천" />
                    <Tooltip
                      formatter={(value) =>
                        `₩${(Number(value) * 1000).toLocaleString("ko-KR")}`
                      }
                    />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 월별 매출 */}
            {monthChart.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">월별 매출</CardTitle>
                </CardHeader>
                <CardContent className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="천" />
                      <Tooltip
                        formatter={(value) =>
                          `₩${(Number(value) * 1000).toLocaleString("ko-KR")}`
                        }
                      />
                      <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* 채널별 매출 표 — 정확한 숫자 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">채널별 상세</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byChannel.length === 0 ? (
                  <p className="py-4 text-sm text-[var(--jm-text-muted)]">데이터 없음</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>채널</TableHead>
                        <TableHead className="text-right">건수</TableHead>
                        <TableHead className="text-right">매출</TableHead>
                        <TableHead className="text-right">수수료</TableHead>
                        <TableHead className="text-right">실수령</TableHead>
                        <TableHead className="text-right">평균</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.byChannel.map((c) => (
                        <TableRow key={c.channelId}>
                          <TableCell className="font-medium">{c.channelName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.count.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₩{c.total.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--jm-danger-fg)]">
                            {c.commission > 0
                              ? `−₩${c.commission.toLocaleString("ko-KR")}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            ₩{c.net.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            ₩{Math.round(c.total / Math.max(1, c.count)).toLocaleString("ko-KR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* 고객 type 별 매출 — 개인 / 기업 / 미등록 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">고객 분류별 매출</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.byCustomerType.length === 0 ? (
                  <p className="py-4 text-sm text-[var(--jm-text-muted)]">데이터 없음</p>
                ) : (
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
                          ? "bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)] border-[var(--jm-warning-solid)]"
                          : g.type === "INDIVIDUAL"
                            ? "bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)] border-[var(--jm-success-solid)]"
                            : "bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] border-[var(--jm-border)]";
                      const totalAll = stats.byCustomerType.reduce(
                        (s, x) => s + x.total,
                        0,
                      );
                      const pct = totalAll > 0 ? (g.total / totalAll) * 100 : 0;
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
                            ₩{g.total.toLocaleString("ko-KR")}
                          </div>
                          <div className="text-jm-2xs tabular-nums opacity-70">
                            {g.count.toLocaleString("ko-KR")}건
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 기업 매출 top 10 */}
            {stats.topBusinessCustomers.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">기업 고객 매출 top 10</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>상호</TableHead>
                        <TableHead>사업자번호</TableHead>
                        <TableHead className="text-right">건수</TableHead>
                        <TableHead className="text-right">매출</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.topBusinessCustomers.map((c, i) => (
                        <TableRow key={c.customerId}>
                          <TableCell className="text-[var(--jm-text-muted)]">
                            {i + 1}
                          </TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="font-mono text-xs text-[var(--jm-text-muted)]">
                            {c.businessNumber ?? "-"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {c.count.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₩{c.total.toLocaleString("ko-KR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* 매출 top 20 상품 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">매출 상품 ranking (top 20)</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.topProducts.length === 0 ? (
                  <p className="py-4 text-sm text-[var(--jm-text-muted)]">데이터 없음</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>상품</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">주문 수</TableHead>
                        <TableHead className="text-right">매출</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.topProducts.map((p, i) => (
                        <TableRow key={p.productId ?? i}>
                          <TableCell className="text-[var(--jm-text-muted)]">{i + 1}</TableCell>
                          <TableCell className="font-medium">{p.productName}</TableCell>
                          <TableCell className="font-mono text-xs text-[var(--jm-text-muted)]">
                            {p.sku}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.qty.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-[var(--jm-text-muted)]">
                            {p.orders.toLocaleString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₩{p.revenue.toLocaleString("ko-KR")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
  tone?: "success";
}) {
  const toneClass = tone === "success" ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-text)]";
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5 text-xs text-[var(--jm-text-muted)]">
          {icon}
          <span>{label}</span>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="mt-0.5 text-jm-2xs text-[var(--jm-text-muted)]">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--jm-text-muted)]">
      데이터 없음
    </div>
  );
}

function SalesSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-24" />
              <Skeleton className="mt-1 h-3 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
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
  );
}
