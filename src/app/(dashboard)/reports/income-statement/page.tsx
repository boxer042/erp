"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toCSV, downloadCSV } from "@/lib/utils";
import {
  JmCard,
  JmStat,
  JmSegmentedControl,
  JmSkeleton,
  JmAlert,
  JmBadge,
  JmButton,
  JmDateRangePicker,
  type DateRange,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDrawerBody,
  JmDrawerClose,
} from "@/jm";
import { Info, FileSpreadsheet, Download, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import {
  LineChart,
  Line as ChartLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend as ChartLegend,
} from "recharts";

type PeriodKey =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "custom";

interface RevenueBreakdown {
  product: number;
  repair: number;
  rental: number;
  total: number;
}

interface DeductionBreakdown {
  refund: number;
  exchange: number;
  cancel: number;
  partial: number;
  total: number;
}

interface OpexBreakdown {
  channelCommission: number;
  cardFee: number;
  sellingCost: number;
  categories: { category: string; amount: number; isTaxable?: boolean }[];
  generalTotal: number;
  total: number;
}

interface VatStatus {
  outputVat: number;
  inputVat: number;
  estimatedPayment: number;
}

interface PeriodReport {
  revenue: RevenueBreakdown;
  deductions: DeductionBreakdown;
  netRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: OpexBreakdown;
  operatingIncome: number;
  vat: VatStatus;
  missingCostCount: number;
}

interface ReportData {
  period: { from: string; to: string };
  prevPeriod: { from: string; to: string };
  current: PeriodReport;
  previous: PeriodReport;
}

const CATEGORY_LABELS: Record<string, string> = {
  SHIPPING: "배송비",
  RENT: "임대료",
  UTILITIES: "공과금",
  SALARY: "인건비",
  PACKAGING: "포장재",
  OFFICE_SUPPLIES: "사무용품",
  MARKETING: "광고선전비",
  MAINTENANCE: "유지보수",
  INVENTORY_USAGE: "재고 사용",
  OTHER: "기타",
};

function getPeriodRange(key: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "this-month") {
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
  }
  if (key === "last-month") {
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
  }
  if (key === "this-quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) };
  }
  if (key === "last-quarter") {
    const qStart = Math.floor(m / 3) * 3 - 3;
    return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) };
  }
  return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
}

function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function formatPercent(num: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

function deltaPercent(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export default function IncomeStatementPage() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this-month");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [deductionDrawerOpen, setDeductionDrawerOpen] = useState(false);

  const { from, to } = useMemo(() => {
    if (periodKey === "custom") {
      if (customRange?.from && customRange?.to) {
        // to 는 inclusive 표시 → 다음날 00:00 으로 변환
        const toExclusive = new Date(customRange.to);
        toExclusive.setDate(toExclusive.getDate() + 1);
        return { from: customRange.from, to: toExclusive };
      }
      return getPeriodRange("this-month");
    }
    return getPeriodRange(periodKey);
  }, [periodKey, customRange]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.reports.incomeStatement({
      from: from.toISOString(),
      to: to.toISOString(),
    }),
    queryFn: () =>
      apiGet<ReportData>(
        `/api/reports/income-statement?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
  });

  const cur = data?.current;
  const prev = data?.previous;

  const operatingMargin =
    cur && cur.netRevenue > 0 ? (cur.operatingIncome / cur.netRevenue) * 100 : 0;
  const refundRate =
    cur && cur.revenue.total > 0 ? (cur.deductions.total / cur.revenue.total) * 100 : 0;

  const handleExportCSV = () => {
    if (!cur) return;
    const rows: { item: string; amount: number }[] = [
      { item: "[매출액]", amount: 0 },
      { item: "  판매상품", amount: cur.revenue.product },
      { item: "  수리", amount: cur.revenue.repair },
      { item: "  임대", amount: cur.revenue.rental },
      { item: "  총 매출액", amount: cur.revenue.total },
    ];
    if (cur.deductions.total > 0) {
      rows.push({ item: "[매출 차감]", amount: 0 });
      if (cur.deductions.refund > 0)
        rows.push({ item: "  반품", amount: -cur.deductions.refund });
      if (cur.deductions.exchange > 0)
        rows.push({ item: "  교환", amount: -cur.deductions.exchange });
      if (cur.deductions.cancel > 0)
        rows.push({ item: "  매출 취소", amount: -cur.deductions.cancel });
      if (cur.deductions.partial > 0)
        rows.push({ item: "  부분 환불 (비례 차감)", amount: -cur.deductions.partial });
      rows.push({ item: "  매출 차감 합계", amount: -cur.deductions.total });
    }
    rows.push({ item: "순 매출액", amount: cur.netRevenue });
    rows.push({ item: "[매출원가]", amount: 0 });
    rows.push({ item: "  상품 매출원가 (FIFO)", amount: -cur.costOfGoodsSold });
    rows.push({ item: "매출총이익", amount: cur.grossProfit });
    rows.push({ item: "[판매관리비]", amount: 0 });
    for (const c of cur.operatingExpenses.categories) {
      rows.push({
        item: `  ${CATEGORY_LABELS[c.category] ?? c.category}${c.isTaxable === false ? " (면세)" : ""}`,
        amount: -c.amount,
      });
    }
    if (cur.operatingExpenses.channelCommission > 0)
      rows.push({
        item: "  채널 수수료",
        amount: -cur.operatingExpenses.channelCommission,
      });
    if (cur.operatingExpenses.cardFee > 0)
      rows.push({ item: "  카드 수수료", amount: -cur.operatingExpenses.cardFee });
    if (cur.operatingExpenses.sellingCost > 0)
      rows.push({
        item: "  판매비용 (스냅샷)",
        amount: -cur.operatingExpenses.sellingCost,
      });
    rows.push({ item: "  판관비 합계", amount: -cur.operatingExpenses.total });
    rows.push({ item: "영업이익", amount: cur.operatingIncome });
    rows.push({ item: "", amount: 0 });
    rows.push({ item: "[부가세 현황 (참고)]", amount: 0 });
    rows.push({ item: "  매출 부가세 (예수금)", amount: cur.vat.outputVat });
    rows.push({ item: "  매입 부가세 (대급금)", amount: cur.vat.inputVat });
    rows.push({
      item: cur.vat.estimatedPayment < 0 ? "  예상 환급액" : "  예상 납부액",
      amount: Math.abs(cur.vat.estimatedPayment),
    });

    const csv = toCSV(rows, [
      { key: "item", label: "항목" },
      { key: "amount", label: "금액" },
    ]);
    const periodLabel = `${format(from, "yyyyMMdd")}-${format(new Date(to.getTime() - 1), "yyyyMMdd")}`;
    downloadCSV(`손익계산서_${periodLabel}.csv`, csv);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-2xl font-bold text-[var(--jm-text)]">
              손익계산서
            </h1>
            <p className="mt-1 text-jm-sm text-[var(--jm-text-muted)]">
              공급가액 기준 · 총액주의 · {format(from, "yyyy.MM.dd")} ~{" "}
              {format(new Date(to.getTime() - 1), "yyyy.MM.dd")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JmSegmentedControl<PeriodKey>
              value={periodKey}
              onChange={setPeriodKey}
              options={[
                { value: "this-month", label: "이번 달" },
                { value: "last-month", label: "지난 달" },
                { value: "this-quarter", label: "이번 분기" },
                { value: "last-quarter", label: "지난 분기" },
                { value: "this-year", label: "올해" },
                { value: "custom", label: "사용자 지정" },
              ]}
            />
            <JmButton
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!cur}
            >
              <Download className="size-4" />
              CSV
            </JmButton>
          </div>
        </div>

        {periodKey === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-jm-sm text-[var(--jm-text-muted)]">기간 선택</span>
            <JmDateRangePicker
              value={customRange}
              onChange={setCustomRange}
              size="sm"
              numberOfMonths={2}
              className="w-[280px]"
              placeholder="기간을 선택하세요"
            />
          </div>
        )}

        {/* 에러 상태 */}
        {isError && (
          <JmAlert variant="danger">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">손익계산서를 불러오지 못했습니다.</span>
              <span className="text-jm-xs">
                {error instanceof Error ? error.message : "알 수 없는 오류"}
              </span>
            </div>
          </JmAlert>
        )}

        {/* 빈 상태 안내 */}
        {!isPending && !isError && cur && cur.revenue.total === 0 && cur.operatingExpenses.total === 0 && (
          <JmAlert variant="warning" icon={<Info className="size-4" />}>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">해당 기간의 매출·지출 데이터가 없습니다.</span>
              <span className="text-jm-xs">
                다른 기간을 선택하거나, 주문/지출 데이터가 입력된 뒤 다시 확인해주세요.
              </span>
            </div>
          </JmAlert>
        )}

        {/* 안내 카드 */}
        <JmAlert variant="info" icon={<Info className="size-4" />}>
          <div className="flex flex-col gap-0.5">
            <span>
              <span className="font-semibold">공급가액 기준</span>으로 표시됩니다. 부가세는 손익에
              영향이 없으므로 어디에도 포함되지 않습니다.
            </span>
            <span className="text-jm-xs">
              매출은 <span className="font-medium">발생 시점</span>으로 잡고,
              환불·교환·매출취소·부분환불은 별도{" "}
              <span className="font-medium">매출 차감</span> 라인으로 표시합니다. 부분환불은
              수수료·판매비용·매출원가도 같은 비율로 비례 차감됩니다.
            </span>
          </div>
        </JmAlert>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {isPending || !cur || !prev ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <JmStat
                label="순 매출액"
                value={formatWon(cur.netRevenue)}
                hint={
                  cur.deductions.total > 0
                    ? `총 ${formatWon(cur.revenue.total)} · 환불율 ${refundRate.toFixed(1)}%`
                    : `총 ${formatWon(cur.revenue.total)}`
                }
                delta={deltaPercent(cur.netRevenue, prev.netRevenue)}
                compareLabel="지난 동일 기간 대비"
              />
              <JmStat
                label="매출총이익"
                value={formatWon(cur.grossProfit)}
                hint={formatPercent(cur.grossProfit, cur.netRevenue) + " (순매출 대비)"}
                delta={deltaPercent(cur.grossProfit, prev.grossProfit)}
                compareLabel="지난 동일 기간 대비"
              />
              <JmStat
                label="영업이익"
                value={formatWon(cur.operatingIncome)}
                hint={
                  cur.operatingIncome < 0
                    ? "영업손실"
                    : formatPercent(cur.operatingIncome, cur.netRevenue) + " (순매출 대비)"
                }
                delta={deltaPercent(cur.operatingIncome, prev.operatingIncome)}
                compareLabel="지난 동일 기간 대비"
                positiveIsGood
              />
              <JmStat
                label="영업이익률"
                value={`${operatingMargin.toFixed(1)}%`}
                hint="순매출 대비 영업이익"
              />
            </>
          )}
        </div>

        {/* 손익계산서 본문 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
              <FileSpreadsheet className="size-4 text-[var(--jm-text-muted)]" />
              손익계산서
            </h2>
          </div>
          <div className="px-5 py-4">
            {isPending || !cur ? (
              <BodySkeleton />
            ) : (
              <IncomeStatementBody
                data={cur}
                onOpenDeductions={
                  cur.deductions.total > 0 ? () => setDeductionDrawerOpen(true) : undefined
                }
              />
            )}
          </div>
        </JmCard>

        {/* 월별 추이 차트 */}
        <MonthlyTrendCard />

        {/* 부가세 현황 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
              부가세 현황 (참고)
            </h2>
            <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
              부가세는 손익에 포함되지 않습니다. 신고 시 참고용.
            </p>
          </div>
          <div className="px-5 py-4">
            {isPending || !cur ? (
              <div className="grid gap-4 md:grid-cols-3">
                <JmSkeleton className="h-20 w-full" />
                <JmSkeleton className="h-20 w-full" />
                <JmSkeleton className="h-20 w-full" />
              </div>
            ) : (
              <VatStatusBody vat={cur.vat} />
            )}
          </div>
        </JmCard>

        {cur && cur.missingCostCount > 0 && (
          <JmAlert variant="warning">
            원가 정보가 없는 주문 항목이{" "}
            <span className="font-semibold">{cur.missingCostCount}건</span> 있습니다. 매출원가가
            과소 계상되어 영업이익이 실제보다 높게 보일 수 있어요. (구주문 또는 기초 등록 누락
            가능성)
          </JmAlert>
        )}

        <DeductionDrawer
          open={deductionDrawerOpen}
          onOpenChange={setDeductionDrawerOpen}
          from={from}
          to={to}
        />
      </div>
    </div>
  );
}

// ─── 월별 추이 차트 ──────────────────────────────────────────────────────

interface MonthlyPoint {
  month: string;
  netRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingIncome: number;
}

function MonthlyTrendCard() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.reports.incomeStatementMonthly({ months: 12 }),
    queryFn: () =>
      apiGet<{ points: MonthlyPoint[] }>("/api/reports/income-statement/monthly?months=12"),
  });

  const points = data?.points ?? [];

  return (
    <JmCard>
      <div className="border-b border-[var(--jm-border)] px-5 py-3">
        <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
          <TrendingUp className="size-4 text-[var(--jm-text-muted)]" />
          최근 12개월 추이
        </h2>
        <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
          공급가액 기준 · 순매출 / 매출원가 / 매출총이익 / 영업이익
        </p>
      </div>
      <div className="px-5 py-4">
        {isPending ? (
          <JmSkeleton className="h-72 w-full" />
        ) : points.length === 0 ? (
          <div className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
            추이 데이터가 없습니다.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--jm-border)" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v: string) => v.slice(5)}
                  stroke="var(--jm-text-muted)"
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
                  stroke="var(--jm-text-muted)"
                  fontSize={11}
                  width={56}
                />
                <ChartTooltip
                  contentStyle={{
                    background: "var(--jm-surface)",
                    border: "1px solid var(--jm-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => formatWon(Number(v))}
                  labelFormatter={(v) =>
                    typeof v === "string" ? `${v.slice(0, 4)}년 ${v.slice(5)}월` : String(v)
                  }
                />
                <ChartLegend
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  iconType="line"
                />
                <ChartLine
                  type="monotone"
                  dataKey="netRevenue"
                  name="순매출"
                  stroke="var(--jm-action)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <ChartLine
                  type="monotone"
                  dataKey="costOfGoodsSold"
                  name="매출원가"
                  stroke="var(--jm-warning-fg)"
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                  strokeDasharray="4 2"
                />
                <ChartLine
                  type="monotone"
                  dataKey="grossProfit"
                  name="매출총이익"
                  stroke="var(--jm-info-fg)"
                  strokeWidth={1.5}
                  dot={{ r: 2 }}
                />
                <ChartLine
                  type="monotone"
                  dataKey="operatingIncome"
                  name="영업이익"
                  stroke="var(--jm-success-fg)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </JmCard>
  );
}

// ─── 차감 드릴다운 Drawer ─────────────────────────────────────────────────

interface DeductionRow {
  orderId: string;
  orderNo: string;
  orderDate: string;
  customerName: string | null;
  kind: "refund" | "exchange" | "cancel" | "partial";
  amount: number;
  totalAmount: number;
}

const DEDUCTION_KIND_LABELS: Record<DeductionRow["kind"], string> = {
  refund: "반품",
  exchange: "교환",
  cancel: "매출 취소",
  partial: "부분 환불",
};

const DEDUCTION_KIND_VARIANTS: Record<
  DeductionRow["kind"],
  "danger" | "warning" | "info" | "default"
> = {
  refund: "danger",
  exchange: "warning",
  cancel: "info",
  partial: "default",
};

function DeductionDrawer({
  open,
  onOpenChange,
  from,
  to,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  from: Date;
  to: Date;
}) {
  const [kindFilter, setKindFilter] = useState<"all" | DeductionRow["kind"]>("all");

  const { data, isPending } = useQuery({
    queryKey: queryKeys.reports.incomeStatementDeductions({
      from: from.toISOString(),
      to: to.toISOString(),
      kind: kindFilter,
    }),
    queryFn: () =>
      apiGet<{ rows: DeductionRow[] }>(
        `/api/reports/income-statement/deductions?from=${from.toISOString()}&to=${to.toISOString()}${
          kindFilter !== "all" ? `&kind=${kindFilter}` : ""
        }`,
      ),
    enabled: open,
  });

  const rows = data?.rows ?? [];
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="right" size="lg">
        <JmDrawerHeader>
          <JmDrawerTitle>매출 차감 상세</JmDrawerTitle>
          <p className="mt-1 text-jm-xs text-[var(--jm-text-muted)]">
            {format(from, "yyyy.MM.dd")} ~ {format(new Date(to.getTime() - 1), "yyyy.MM.dd")}
            {" · "}
            총 {rows.length}건 · 공급가액 {formatWon(totalAmount)}
          </p>
        </JmDrawerHeader>
        <JmDrawerBody className="px-0">
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <JmSegmentedControl<"all" | DeductionRow["kind"]>
              value={kindFilter}
              onChange={setKindFilter}
              size="sm"
              options={[
                { value: "all", label: "전체" },
                { value: "refund", label: "반품" },
                { value: "exchange", label: "교환" },
                { value: "cancel", label: "매출취소" },
                { value: "partial", label: "부분환불" },
              ]}
            />
          </div>
          <div className="px-5 py-4">
            {isPending ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <JmSkeleton className="h-5 w-40" />
                    <JmSkeleton className="h-5 w-24" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-jm-sm text-[var(--jm-text-muted)]">
                해당하는 차감 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-jm-sm">
                  <thead>
                    <tr className="border-b border-[var(--jm-border)] text-jm-xs text-[var(--jm-text-muted)]">
                      <th className="px-2 py-2 text-left font-medium">주문번호</th>
                      <th className="px-2 py-2 text-left font-medium">날짜</th>
                      <th className="px-2 py-2 text-left font-medium">고객</th>
                      <th className="px-2 py-2 text-left font-medium">유형</th>
                      <th className="px-2 py-2 text-right font-medium">차감액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.orderId}
                        className="border-b border-[var(--jm-border)] last:border-b-0"
                      >
                        <td className="px-2 py-2 font-mono text-jm-xs">{r.orderNo}</td>
                        <td className="px-2 py-2 tabular-nums text-jm-xs">
                          {format(new Date(r.orderDate), "yyyy.MM.dd")}
                        </td>
                        <td className="px-2 py-2 text-jm-xs">{r.customerName ?? "—"}</td>
                        <td className="px-2 py-2">
                          <JmBadge variant={DEDUCTION_KIND_VARIANTS[r.kind]} size="sm">
                            {DEDUCTION_KIND_LABELS[r.kind]}
                          </JmBadge>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--jm-text)]">
                          ({formatWon(r.amount)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </JmDrawerBody>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--jm-border)] px-5 py-3">
          <JmDrawerClose
            render={
              <JmButton variant="outline" size="sm">
                닫기
              </JmButton>
            }
          />
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}

// ─── 본문 ────────────────────────────────────────────────────────────────

function IncomeStatementBody({
  data,
  onOpenDeductions,
}: {
  data: PeriodReport;
  onOpenDeductions?: () => void;
}) {
  const {
    revenue,
    deductions,
    netRevenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    operatingIncome,
  } = data;

  const hasDeductions = deductions.total > 0;

  return (
    <div className="text-jm-sm">
      <Section title="매출액 (총액)">
        <Line label="판매상품" amount={revenue.product} />
        <Line label="수리" amount={revenue.repair} />
        <Line label="임대" amount={revenue.rental} />
        <Subtotal label="총 매출액" amount={revenue.total} />
      </Section>

      {hasDeductions && (
        <Section
          title="매출 차감"
          rightSlot={
            <div className="flex items-center gap-2">
              {revenue.total > 0 && (
                <JmBadge
                  variant={
                    deductions.total / revenue.total >= 0.1
                      ? "danger"
                      : deductions.total / revenue.total >= 0.05
                        ? "warning"
                        : "default"
                  }
                  size="sm"
                >
                  환불율 {((deductions.total / revenue.total) * 100).toFixed(1)}%
                </JmBadge>
              )}
              {onOpenDeductions && (
                <button
                  type="button"
                  onClick={onOpenDeductions}
                  className="text-jm-2xs font-medium text-[var(--jm-action)] underline-offset-2 hover:underline"
                >
                  상세보기
                </button>
              )}
            </div>
          }
        >
          {deductions.refund > 0 && (
            <Line label="반품 (RETURNED)" amount={deductions.refund} negative />
          )}
          {deductions.exchange > 0 && (
            <Line label="교환 (EXCHANGED)" amount={deductions.exchange} negative />
          )}
          {deductions.cancel > 0 && (
            <Line label="매출 취소 (외상 반품)" amount={deductions.cancel} negative />
          )}
          {deductions.partial > 0 && (
            <Line label="부분 환불 (비례 차감)" amount={deductions.partial} negative />
          )}
          <Subtotal label="매출 차감 합계" amount={deductions.total} negative />
        </Section>
      )}

      <BigLine label="순 매출액" amount={netRevenue} />

      <Section title="매출원가">
        <Line label="상품 매출원가 (FIFO 실제 원가)" amount={costOfGoodsSold} negative />
      </Section>

      <BigLine label="매출총이익" amount={grossProfit} />

      <Section title="판매관리비">
        {operatingExpenses.categories.map((c) => (
          <Line
            key={c.category}
            label={
              <span className="inline-flex items-center gap-1.5">
                {CATEGORY_LABELS[c.category] ?? c.category}
                {c.isTaxable === false && (
                  <JmBadge variant="default" size="sm">
                    면세
                  </JmBadge>
                )}
              </span>
            }
            amount={c.amount}
            negative
          />
        ))}
        {operatingExpenses.channelCommission > 0 && (
          <Line label="채널 수수료" amount={operatingExpenses.channelCommission} negative />
        )}
        {operatingExpenses.cardFee > 0 && (
          <Line label="카드 수수료" amount={operatingExpenses.cardFee} negative />
        )}
        {operatingExpenses.sellingCost > 0 && (
          <Line label="판매비용 (스냅샷)" amount={operatingExpenses.sellingCost} negative />
        )}
        <Subtotal label="판관비 합계" amount={operatingExpenses.total} negative />
      </Section>

      <BigLine label="영업이익" amount={operatingIncome} highlight />
    </div>
  );
}

function VatStatusBody({ vat }: { vat: VatStatus }) {
  const refund = vat.estimatedPayment < 0;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
        <div className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
          매출 부가세 (예수금)
        </div>
        <div className="mt-1 text-jm-2xl font-bold tabular-nums text-[var(--jm-text)]">
          {formatWon(vat.outputVat)}
        </div>
        <div className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
          고객에게 받아둔 부가세 (부채)
        </div>
      </div>
      <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
        <div className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
          매입 부가세 (대급금)
        </div>
        <div className="mt-1 text-jm-2xl font-bold tabular-nums text-[var(--jm-text)]">
          {formatWon(vat.inputVat)}
        </div>
        <div className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
          거래처에 미리 낸 부가세 (자산)
        </div>
      </div>
      <div
        className={`rounded-xl border p-4 ${
          refund
            ? "border-[var(--jm-success-border)] bg-[var(--jm-success-bg)]"
            : "border-[var(--jm-warning-border)] bg-[var(--jm-warning-bg)]"
        }`}
      >
        <div className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
          {refund ? "예상 환급액" : "예상 납부액"}
        </div>
        <div
          className={`mt-1 text-jm-2xl font-bold tabular-nums ${
            refund ? "text-[var(--jm-success-fg)]" : "text-[var(--jm-warning-fg)]"
          }`}
        >
          {formatWon(Math.abs(vat.estimatedPayment))}
        </div>
        <div className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
          {refund ? "대급금 > 예수금 → 환급 예상" : "예수금 − 대급금"}
        </div>
      </div>
    </div>
  );
}

// ─── 라인 컴포넌트 ───────────────────────────────────────────────────────

function Section({
  title,
  children,
  rightSlot,
}: {
  title: string;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--jm-border)] py-2 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-jm-xs font-semibold uppercase tracking-wide text-[var(--jm-text-muted)]">
          {title}
        </span>
        {rightSlot}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Line({
  label,
  amount,
  negative,
}: {
  label: React.ReactNode;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pl-4 py-1">
      <span className="text-[var(--jm-text)]">{label}</span>
      <span className="tabular-nums text-[var(--jm-text)]">
        {negative && amount !== 0 ? `(${formatWon(amount)})` : formatWon(amount)}
      </span>
    </div>
  );
}

function Subtotal({
  label,
  amount,
  negative,
}: {
  label: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-[var(--jm-border)] pl-4 pt-1.5">
      <span className="font-semibold text-[var(--jm-text)]">{label}</span>
      <span className="font-semibold tabular-nums text-[var(--jm-text)]">
        {negative && amount !== 0 ? `(${formatWon(amount)})` : formatWon(amount)}
      </span>
    </div>
  );
}

function BigLine({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
}) {
  const positive = amount >= 0;
  return (
    <div
      className={`my-3 flex items-center justify-between rounded-lg border px-4 py-2.5 ${
        highlight
          ? positive
            ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
            : "border-[var(--jm-danger-border)] bg-[var(--jm-danger-bg)]"
          : "border-[var(--jm-border)] bg-[var(--jm-surface-muted)]"
      }`}
    >
      <span className="text-jm-base font-bold text-[var(--jm-text)]">{label}</span>
      <span
        className={`text-jm-xl font-bold tabular-nums ${
          highlight && !positive ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {formatWon(amount)}
      </span>
    </div>
  );
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
      <JmSkeleton className="h-3 w-20" />
      <JmSkeleton className="h-8 w-32" />
      <JmSkeleton className="h-3 w-24" />
    </div>
  );
}

function BodySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <JmSkeleton className="h-4 w-32" />
          <JmSkeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
