"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toCSV, downloadCSV } from "@/lib/utils";
import {
  JmCard,
  JmStat,
  JmSkeleton,
  JmAlert,
  JmBadge,
  JmButton,
  JmSegmentedControl,
  JmDatePicker,
} from "@/jm";
import { Info, Scale, Download } from "lucide-react";
import { format } from "date-fns";

type AsOfKey =
  | "today"
  | "this-month-end"
  | "this-quarter-end"
  | "last-quarter-end"
  | "year-end"
  | "custom";

function getAsOfDate(key: AsOfKey, customDate?: Date): Date {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "today") return now;
  if (key === "this-month-end") {
    // 이번 달 마지막 일 (다음 달 1일 - 1ms)
    return new Date(new Date(y, m + 1, 1).getTime() - 1);
  }
  if (key === "this-quarter-end") {
    const qStart = Math.floor(m / 3) * 3;
    return new Date(new Date(y, qStart + 3, 1).getTime() - 1);
  }
  if (key === "last-quarter-end") {
    const qStart = Math.floor(m / 3) * 3;
    return new Date(new Date(y, qStart, 1).getTime() - 1);
  }
  if (key === "year-end") {
    return new Date(new Date(y + 1, 0, 1).getTime() - 1);
  }
  // custom
  return customDate ?? now;
}

interface AssetBreakdown {
  receivables: number;
  inventory: number;
  inputVat: number;
  other: number;
  total: number;
}

interface LiabilityBreakdown {
  payables: number;
  outputVat: number;
  other: number;
  total: number;
}

interface BalanceSheetData {
  asOf: string;
  vatPeriodStart: string;
  assets: AssetBreakdown;
  liabilities: LiabilityBreakdown;
  equity: { netAssets: number };
  meta: { customerAdvances: number; supplierAdvances: number };
}

function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export default function BalanceSheetPage() {
  const [asOfKey, setAsOfKey] = useState<AsOfKey>("today");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);

  const asOf = useMemo(() => getAsOfDate(asOfKey, customDate), [asOfKey, customDate]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.reports.balanceSheet({ asOf: asOf.toISOString() }),
    queryFn: () =>
      apiGet<BalanceSheetData>(
        `/api/reports/balance-sheet?asOf=${asOf.toISOString()}`,
      ),
  });

  // 부채비율 = 부채 / 자본 × 100
  const debtRatio =
    data && data.equity.netAssets > 0
      ? (data.liabilities.total / data.equity.netAssets) * 100
      : 0;

  const asOfDate = data ? new Date(data.asOf) : asOf;
  const vatStart = data ? new Date(data.vatPeriodStart) : new Date();

  const handleExportCSV = () => {
    if (!data) return;
    const rows: { item: string; amount: number }[] = [
      { item: `기준일: ${format(asOfDate, "yyyy.MM.dd")}`, amount: 0 },
      { item: "", amount: 0 },
      { item: "[자산]", amount: 0 },
      { item: "  매출채권 (외상 미수)", amount: data.assets.receivables },
      { item: "  재고자산 (FIFO 평가)", amount: data.assets.inventory },
      { item: "  부가세 대급금 (임시)", amount: data.assets.inputVat },
      { item: "  자산 총계", amount: data.assets.total },
      { item: "", amount: 0 },
      { item: "[부채]", amount: 0 },
      { item: "  매입채무 (거래처 미지급)", amount: data.liabilities.payables },
      { item: "  부가세 예수금 (임시)", amount: data.liabilities.outputVat },
      { item: "  부채 총계", amount: data.liabilities.total },
      { item: "", amount: 0 },
      { item: "[자본]", amount: 0 },
      { item: "  순자산 (자산 - 부채)", amount: data.equity.netAssets },
      { item: "", amount: 0 },
      { item: "검산 (부채 + 자본)", amount: data.liabilities.total + data.equity.netAssets },
    ];
    if (data.meta.customerAdvances > 0 || data.meta.supplierAdvances > 0) {
      rows.push({ item: "", amount: 0 });
      rows.push({ item: "[선수금/선급금 (참고)]", amount: 0 });
      if (data.meta.customerAdvances > 0)
        rows.push({ item: "  선수금 (고객 선납)", amount: data.meta.customerAdvances });
      if (data.meta.supplierAdvances > 0)
        rows.push({ item: "  선급금 (거래처 선납)", amount: data.meta.supplierAdvances });
    }
    const csv = toCSV(rows, [
      { key: "item", label: "항목" },
      { key: "amount", label: "금액" },
    ]);
    downloadCSV(`재무상태표_${format(asOfDate, "yyyyMMdd")}.csv`, csv);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-2xl font-bold text-[var(--jm-text)]">
              재무상태표
            </h1>
            <p className="mt-1 text-jm-sm text-[var(--jm-text-muted)]">
              기준일 {format(asOfDate, "yyyy.MM.dd")} · 부가세 누적{" "}
              {format(vatStart, "yyyy.MM.dd")} ~ {format(asOfDate, "yyyy.MM.dd")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JmSegmentedControl<AsOfKey>
              value={asOfKey}
              onChange={setAsOfKey}
              options={[
                { value: "today", label: "오늘" },
                { value: "this-month-end", label: "이번 달 말" },
                { value: "this-quarter-end", label: "이번 분기 말" },
                { value: "last-quarter-end", label: "지난 분기 말" },
                { value: "year-end", label: "올해 말" },
                { value: "custom", label: "사용자 지정" },
              ]}
            />
            <JmButton
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!data}
            >
              <Download className="size-4" />
              CSV
            </JmButton>
          </div>
        </div>

        {asOfKey === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-jm-sm text-[var(--jm-text-muted)]">기준일</span>
            <JmDatePicker
              value={customDate}
              onChange={setCustomDate}
              size="sm"
              className="w-[200px]"
              placeholder="날짜를 선택하세요"
            />
          </div>
        )}

        {/* 에러 상태 */}
        {isError && (
          <JmAlert variant="danger">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">재무상태표를 불러오지 못했습니다.</span>
              <span className="text-jm-xs">
                {error instanceof Error ? error.message : "알 수 없는 오류"}
              </span>
            </div>
          </JmAlert>
        )}

        {/* 빈 상태 안내 */}
        {!isPending && !isError && data && data.assets.total === 0 && data.liabilities.total === 0 && (
          <JmAlert variant="warning" icon={<Info className="size-4" />}>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">기준일 시점의 잔량 데이터가 없습니다.</span>
              <span className="text-jm-xs">
                매출채권/매입채무는 거래처/고객 ledger 잔액에서, 재고는 InventoryLot 에서, 부가세는
                기간 내 Order/Incoming 에서 집계됩니다. 위 데이터가 비어있을 가능성이 있어요.
              </span>
            </div>
          </JmAlert>
        )}

        {/* 안내 카드 */}
        <JmAlert variant="info" icon={<Info className="size-4" />}>
          <div className="flex flex-col gap-0.5">
            <span>
              <span className="font-semibold">약식 재무상태표</span> — 시스템 데이터만으로 만든
              표입니다. 현금/예금/비품/감가상각/자본금/이익잉여금 등 회계 모듈 영역은 빠져
              있어요.
            </span>
            <span className="text-jm-xs">
              부가세 자산·부채는 이번 분기 누적분 (신고·납부 후엔 0으로 정리되어야 정상).
            </span>
          </div>
        </JmAlert>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {isPending || !data ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <JmStat
                label="자산 총계"
                value={formatWon(data.assets.total)}
                hint="매출채권 + 재고 + 부가세대급금"
              />
              <JmStat
                label="부채 총계"
                value={formatWon(data.liabilities.total)}
                hint="매입채무 + 부가세예수금"
                positiveIsGood={false}
              />
              <JmStat
                label="순자산 (자본)"
                value={formatWon(data.equity.netAssets)}
                hint={data.equity.netAssets < 0 ? "자본잠식" : "자산 - 부채"}
              />
              <JmStat
                label="부채비율"
                value={`${debtRatio.toFixed(1)}%`}
                hint={
                  debtRatio >= 200
                    ? "위험 — 부채가 자본의 2배 이상"
                    : debtRatio >= 100
                      ? "주의 — 부채 > 자본"
                      : "안전"
                }
                positiveIsGood={false}
              />
            </>
          )}
        </div>

        {/* 본문 — 자산/부채/자본 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 자산 카드 */}
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
                <Scale className="size-4 text-[var(--jm-text-muted)]" />
                자산
              </h2>
            </div>
            <div className="px-5 py-4">
              {isPending || !data ? (
                <BodySkeleton lines={5} />
              ) : (
                <div className="text-jm-sm">
                  <Section title="유동자산">
                    <Line label="매출채권 (외상 미수)" amount={data.assets.receivables} />
                    <Line label="재고자산 (FIFO 평가)" amount={data.assets.inventory} />
                    <Line
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          부가세 대급금
                          <JmBadge variant="info" size="sm">
                            임시
                          </JmBadge>
                        </span>
                      }
                      amount={data.assets.inputVat}
                    />
                  </Section>
                  <Section title="비유동자산">
                    <DisabledLine label="비품·설비 (회계 모듈 영역)" />
                  </Section>
                  <BigLine label="자산 총계" amount={data.assets.total} />
                </div>
              )}
            </div>
          </JmCard>

          {/* 부채 + 자본 카드 */}
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
                <Scale className="size-4 text-[var(--jm-text-muted)]" />
                부채 + 자본
              </h2>
            </div>
            <div className="px-5 py-4">
              {isPending || !data ? (
                <BodySkeleton lines={5} />
              ) : (
                <div className="text-jm-sm">
                  <Section title="유동부채">
                    <Line label="매입채무 (거래처 미지급)" amount={data.liabilities.payables} negative />
                    <Line
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          부가세 예수금
                          <JmBadge variant="info" size="sm">
                            임시
                          </JmBadge>
                        </span>
                      }
                      amount={data.liabilities.outputVat}
                      negative
                    />
                  </Section>
                  <Section title="자본">
                    <Line
                      label="순자산 (자산 − 부채)"
                      amount={data.equity.netAssets}
                      negative={false}
                    />
                  </Section>
                  <BigLine
                    label="부채 + 자본"
                    amount={data.liabilities.total + data.equity.netAssets}
                  />
                </div>
              )}
            </div>
          </JmCard>
        </div>

        {/* 보조 정보 — 선수금/선급금 */}
        {data && (data.meta.customerAdvances > 0 || data.meta.supplierAdvances > 0) && (
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
                선수금 / 선급금 (참고)
              </h2>
              <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
                고객·거래처 잔액이 음수인 경우의 별도 추적 (위 표엔 미포함)
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
                  <div className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                    선수금 (고객에게 받은 선납액)
                  </div>
                  <div className="mt-1 text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
                    {formatWon(data.meta.customerAdvances)}
                  </div>
                  <div className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
                    부채 성격 — 매출 발생 시 차감
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
                  <div className="text-jm-xs font-medium text-[var(--jm-text-muted)]">
                    선급금 (거래처에 선납한 돈)
                  </div>
                  <div className="mt-1 text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
                    {formatWon(data.meta.supplierAdvances)}
                  </div>
                  <div className="mt-1 text-jm-2xs text-[var(--jm-text-muted)]">
                    자산 성격 — 매입 발생 시 차감
                  </div>
                </div>
              </div>
            </div>
          </JmCard>
        )}

        {/* 한계 안내 */}
        <JmAlert variant="warning">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">정확한 재무상태표를 위해 필요한 추가 데이터</span>
            <span className="text-jm-xs">
              · 현금/예금 잔고 (통장 잔액) · 비품·설비 가치 + 감가상각 · 자본금 · 이익잉여금
              누적 · 미지급비용 (인건비 등 발생주의 기준)
            </span>
            <span className="text-jm-xs">
              이 항목들은 회계 SW (더존·세무사) 영역. 위 표는{" "}
              <span className="font-medium">영업 잔량 중심</span>으로 본 약식 자료.
            </span>
          </div>
        </JmAlert>
      </div>
    </div>
  );
}

// ─── 라인 컴포넌트 ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--jm-border)] py-2 last:border-b-0">
      <div className="mb-1.5 text-jm-xs font-semibold uppercase tracking-wide text-[var(--jm-text-muted)]">
        {title}
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

function DisabledLine({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between pl-4 py-1">
      <span className="text-[var(--jm-text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--jm-text-muted)]">—</span>
    </div>
  );
}

function BigLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="my-3 flex items-center justify-between rounded-lg border border-[var(--jm-action)] bg-[var(--jm-surface-muted)] px-4 py-2.5">
      <span className="text-jm-base font-bold text-[var(--jm-text)]">{label}</span>
      <span className="text-jm-xl font-bold tabular-nums text-[var(--jm-text)]">
        {formatWon(amount)}
      </span>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
      <JmSkeleton className="h-3 w-20" />
      <JmSkeleton className="h-8 w-32" />
      <JmSkeleton className="h-3 w-24" />
    </div>
  );
}

function BodySkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <JmSkeleton className="h-4 w-32" />
          <JmSkeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
