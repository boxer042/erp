"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toCSV, downloadCSV, formatComma, parseComma } from "@/lib/utils";
import {
  JmCard,
  JmStat,
  JmSkeleton,
  JmAlert,
  JmBadge,
  JmButton,
  JmSegmentedControl,
  JmDatePicker,
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
  JmDrawerBody,
  JmDrawerClose,
  JmInput,
  JmSelect,
  JmIconButton,
} from "@/jm";
import { jmButtonVariants } from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { Info, Scale, Download, Settings2, Plus, Trash2, Loader2, Pencil, HelpCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

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
  return customDate ?? now;
}

// ─── 타입 ────────────────────────────────────────────────────────────────

type ManualCategory =
  | "CASH"
  | "EQUIPMENT"
  | "OTHER_ASSET"
  | "LOAN"
  | "OTHER_LIABILITY"
  | "CAPITAL"
  | "RETAINED_EARNINGS";

const CATEGORY_LABELS: Record<ManualCategory, string> = {
  CASH: "현금·예금",
  EQUIPMENT: "비품·설비",
  OTHER_ASSET: "기타 자산",
  LOAN: "차입금",
  OTHER_LIABILITY: "기타 부채",
  CAPITAL: "자본금",
  RETAINED_EARNINGS: "이익잉여금",
};

const CATEGORY_GROUP: Record<ManualCategory, "asset" | "liability" | "equity"> = {
  CASH: "asset",
  EQUIPMENT: "asset",
  OTHER_ASSET: "asset",
  LOAN: "liability",
  OTHER_LIABILITY: "liability",
  CAPITAL: "equity",
  RETAINED_EARNINGS: "equity",
};

interface ManualEntry {
  id: string;
  category: ManualCategory;
  label: string;
  amount: number;
  memo: string | null;
}

interface AssetBreakdown {
  receivables: number;
  inventory: number;
  inputVat: number;
  cash: number;
  equipment: number;
  otherAsset: number;
  total: number;
}

interface LiabilityBreakdown {
  payables: number;
  outputVat: number;
  loan: number;
  otherLiability: number;
  total: number;
}

interface BalanceSheetData {
  asOf: string;
  vatPeriodStart: string;
  assets: AssetBreakdown;
  liabilities: LiabilityBreakdown;
  equity: {
    netAssets: number;
    capital: number;
    retainedEarnings: number;
    impliedNetIncome: number;
  };
  manualEntries: ManualEntry[];
  meta: { customerAdvances: number; supplierAdvances: number };
}

function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const [asOfKey, setAsOfKey] = useState<AsOfKey>("today");
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);

  const asOf = useMemo(() => getAsOfDate(asOfKey, customDate), [asOfKey, customDate]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.reports.balanceSheet({ asOf: asOf.toISOString() }),
    queryFn: () =>
      apiGet<BalanceSheetData>(
        `/api/reports/balance-sheet?asOf=${asOf.toISOString()}`,
      ),
  });

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
      { item: "  부가세 대급금", amount: data.assets.inputVat },
      { item: "  현금·예금", amount: data.assets.cash },
      { item: "  비품·설비", amount: data.assets.equipment },
      { item: "  기타 자산", amount: data.assets.otherAsset },
      { item: "  자산 총계", amount: data.assets.total },
      { item: "", amount: 0 },
      { item: "[부채]", amount: 0 },
      { item: "  매입채무 (거래처 미지급)", amount: data.liabilities.payables },
      { item: "  부가세 예수금", amount: data.liabilities.outputVat },
      { item: "  차입금", amount: data.liabilities.loan },
      { item: "  기타 부채", amount: data.liabilities.otherLiability },
      { item: "  부채 총계", amount: data.liabilities.total },
      { item: "", amount: 0 },
      { item: "[자본]", amount: 0 },
      { item: "  순자산 (자산 - 부채)", amount: data.equity.netAssets },
      { item: "  자본금", amount: data.equity.capital },
      { item: "  이익잉여금 (전기)", amount: data.equity.retainedEarnings },
      { item: "  당기순이익 (추정)", amount: data.equity.impliedNetIncome },
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

  // 수기 항목이 하나도 없으면 안내
  const hasManualEntries = data ? data.manualEntries.length > 0 : false;

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-2xl font-bold text-[var(--jm-text)]">재무상태표</h1>
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
              onClick={() => setManualDrawerOpen(true)}
            >
              <Settings2 className="size-4" />
              수기 항목
            </JmButton>
            <JmButton
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!data}
            >
              <Download className="size-4" />
              CSV
            </JmButton>
            <Link
              href="/reports/help"
              className={jmButtonVariants({ variant: "ghost", size: "sm" })}
            >
              <HelpCircle className="size-4" />
              도움말
            </Link>
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

        {/* 안내 카드 */}
        <JmAlert variant="info" icon={<Info className="size-4" />}>
          <div className="flex flex-col gap-0.5">
            <span>
              매출채권·재고·매입채무·부가세는 시스템이 자동 산출하고, 현금·비품·자본금 등은{" "}
              <span className="font-semibold">[수기 항목]</span> 버튼으로 직접 입력합니다.
            </span>
            <span className="text-jm-xs">
              부가세 자산·부채는 이번 분기 누적분 (신고·납부 후엔 0으로 정리되어야 정상).
            </span>
          </div>
        </JmAlert>

        {!hasManualEntries && data && (
          <JmAlert variant="warning">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                수기 항목이 아직 없어 약식 재무상태표 상태입니다.
              </span>
              <span className="text-jm-xs">
                정식 재무상태표를 만들려면 우측 상단 <span className="font-medium">[수기 항목]</span>{" "}
                에서 현금·예금 잔고, 비품·설비, 자본금, 이익잉여금을 입력하세요.
              </span>
            </div>
          </JmAlert>
        )}

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
              <JmStat label="자산 총계" value={formatWon(data.assets.total)} hint="유동 + 비유동" />
              <JmStat
                label="부채 총계"
                value={formatWon(data.liabilities.total)}
                hint="유동 + 비유동"
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

        {/* 본문 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 자산 */}
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
                <Scale className="size-4 text-[var(--jm-text-muted)]" />
                자산
              </h2>
            </div>
            <div className="px-5 py-4">
              {isPending || !data ? (
                <BodySkeleton lines={6} />
              ) : (
                <div className="text-jm-sm">
                  <Section title="유동자산">
                    {data.assets.cash !== 0 && (
                      <Line label="현금·예금" amount={data.assets.cash} />
                    )}
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
                    {data.assets.otherAsset !== 0 && (
                      <Line label="기타 자산" amount={data.assets.otherAsset} />
                    )}
                  </Section>
                  <Section title="비유동자산">
                    {data.assets.equipment !== 0 ? (
                      <Line label="비품·설비 (장부가)" amount={data.assets.equipment} />
                    ) : (
                      <DisabledLine label="비품·설비 (수기 항목에서 입력)" />
                    )}
                  </Section>
                  <BigLine label="자산 총계" amount={data.assets.total} />
                </div>
              )}
            </div>
          </JmCard>

          {/* 부채 + 자본 */}
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
                <Scale className="size-4 text-[var(--jm-text-muted)]" />
                부채 + 자본
              </h2>
            </div>
            <div className="px-5 py-4">
              {isPending || !data ? (
                <BodySkeleton lines={6} />
              ) : (
                <div className="text-jm-sm">
                  <Section title="부채">
                    <Line
                      label="매입채무 (거래처 미지급)"
                      amount={data.liabilities.payables}
                      negative
                    />
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
                    {data.liabilities.loan !== 0 && (
                      <Line label="차입금" amount={data.liabilities.loan} negative />
                    )}
                    {data.liabilities.otherLiability !== 0 && (
                      <Line
                        label="기타 부채"
                        amount={data.liabilities.otherLiability}
                        negative
                      />
                    )}
                    <Subtotal label="부채 총계" amount={data.liabilities.total} negative />
                  </Section>
                  <Section title="자본">
                    <Line label="순자산 (자산 − 부채)" amount={data.equity.netAssets} />
                    {(data.equity.capital !== 0 ||
                      data.equity.retainedEarnings !== 0) && (
                      <>
                        <div className="mt-1 pl-4 text-jm-2xs text-[var(--jm-text-muted)]">
                          자본 구성 (입력값)
                        </div>
                        <Line label="ㄴ 자본금" amount={data.equity.capital} subtle />
                        <Line
                          label="ㄴ 이익잉여금 (전기)"
                          amount={data.equity.retainedEarnings}
                          subtle
                        />
                        <Line
                          label="ㄴ 당기순이익 (추정)"
                          amount={data.equity.impliedNetIncome}
                          subtle
                        />
                      </>
                    )}
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

        {/* 선수금/선급금 */}
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
      </div>

      <ManualBalanceDrawer
        open={manualDrawerOpen}
        onOpenChange={setManualDrawerOpen}
        entries={data?.manualEntries ?? []}
      />
    </div>
  );
}

// ─── 수기 항목 관리 Drawer ────────────────────────────────────────────────

const CATEGORY_OPTIONS = (
  Object.keys(CATEGORY_LABELS) as ManualCategory[]
).map((c) => ({
  value: c,
  label: `${CATEGORY_LABELS[c]} (${
    CATEGORY_GROUP[c] === "asset" ? "자산" : CATEGORY_GROUP[c] === "liability" ? "부채" : "자본"
  })`,
}));

function ManualBalanceDrawer({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entries: ManualEntry[];
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    category: ManualCategory;
    label: string;
    amount: string;
    memo: string;
  }>({ category: "CASH", label: "", amount: "", memo: "" });

  const resetForm = () => {
    setEditingId(null);
    setForm({ category: "CASH", label: "", amount: "", memo: "" });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.balanceSheet() });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.label.trim()) throw new Error("항목명을 입력해주세요");
      if (!form.amount) throw new Error("금액을 입력해주세요");
      const body = {
        category: form.category,
        label: form.label.trim(),
        amount: form.amount,
        memo: form.memo || undefined,
      };
      return editingId
        ? apiMutate(`/api/manual-balance/${editingId}`, "PUT", body)
        : apiMutate("/api/manual-balance", "POST", body);
    },
    onSuccess: () => {
      toast.success(editingId ? "항목이 수정되었습니다" : "항목이 추가되었습니다");
      invalidate();
      resetForm();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/manual-balance/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("항목이 삭제되었습니다");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const startEdit = (e: ManualEntry) => {
    setEditingId(e.id);
    setForm({
      category: e.category,
      label: e.label,
      amount: String(e.amount),
      memo: e.memo ?? "",
    });
  };

  // 그룹별 묶기
  const grouped: Record<"asset" | "liability" | "equity", ManualEntry[]> = {
    asset: [],
    liability: [],
    equity: [],
  };
  for (const e of entries) grouped[CATEGORY_GROUP[e.category]].push(e);

  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent side="right" size="lg">
        <JmDrawerHeader>
          <JmDrawerTitle>수기 재무 항목</JmDrawerTitle>
          <p className="mt-1 text-jm-xs text-[var(--jm-text-muted)]">
            현금·예금 / 비품·설비 / 차입금 / 자본금 / 이익잉여금 등 시스템 자동 산출 외 항목
          </p>
        </JmDrawerHeader>
        <JmDrawerBody className="px-5 py-4">
          {/* 입력 폼 */}
          <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
            <div className="text-jm-sm font-semibold text-[var(--jm-text)]">
              {editingId ? "항목 수정" : "새 항목 추가"}
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">분류</label>
                  <JmSelect
                    size="sm"
                    options={CATEGORY_OPTIONS}
                    value={form.category}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, category: v as ManualCategory }))
                    }
                  />
                </div>
                <div>
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">금액</label>
                  <JmInput
                    size="sm"
                    value={formatComma(form.amount)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: parseComma(e.target.value) }))
                    }
                    onFocus={focusCaretEnd}
                    inputMode="numeric"
                    placeholder="0"
                    className="text-right tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="text-jm-xs text-[var(--jm-text-muted)]">항목명</label>
                <JmInput
                  size="sm"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  onFocus={focusCaretEnd}
                  placeholder="예: 국민은행 보통예금, 노트북 5대"
                />
              </div>
              <div>
                <label className="text-jm-xs text-[var(--jm-text-muted)]">메모</label>
                <JmInput
                  size="sm"
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  onFocus={focusCaretEnd}
                  placeholder="선택"
                />
              </div>
              <div className="flex items-center gap-2">
                <JmButton
                  variant="cta"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : editingId ? (
                    <Pencil className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {editingId ? "수정" : "추가"}
                </JmButton>
                {editingId && (
                  <JmButton variant="ghost" size="sm" onClick={resetForm}>
                    취소
                  </JmButton>
                )}
              </div>
            </div>
          </div>

          {/* 항목 목록 */}
          <div className="mt-5 flex flex-col gap-4">
            {(["asset", "liability", "equity"] as const).map((group) => {
              const list = grouped[group];
              const groupLabel =
                group === "asset" ? "자산" : group === "liability" ? "부채" : "자본";
              return (
                <div key={group}>
                  <div className="mb-1.5 text-jm-xs font-semibold uppercase tracking-wide text-[var(--jm-text-muted)]">
                    {groupLabel}
                  </div>
                  {list.length === 0 ? (
                    <div className="rounded-lg border border-[var(--jm-border)] px-3 py-3 text-center text-jm-xs text-[var(--jm-text-muted)]">
                      등록된 항목이 없습니다
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {list.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center gap-2 rounded-lg border border-[var(--jm-border)] px-3 py-2"
                        >
                          <JmBadge variant="default" size="sm">
                            {CATEGORY_LABELS[e.category]}
                          </JmBadge>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-jm-sm text-[var(--jm-text)]">
                              {e.label}
                            </div>
                            {e.memo && (
                              <div className="truncate text-jm-2xs text-[var(--jm-text-muted)]">
                                {e.memo}
                              </div>
                            )}
                          </div>
                          <span className="tabular-nums text-jm-sm font-medium text-[var(--jm-text)]">
                            {formatWon(e.amount)}
                          </span>
                          <JmIconButton
                            size="sm"
                            variant="ghost"
                            aria-label="수정"
                            onClick={() => startEdit(e)}
                          >
                            <Pencil className="size-4" />
                          </JmIconButton>
                          <JmIconButton
                            size="sm"
                            variant="ghost"
                            aria-label="삭제"
                            onClick={() => {
                              if (confirm(`"${e.label}" 항목을 삭제하시겠습니까?`))
                                deleteMutation.mutate(e.id);
                            }}
                            disabled={
                              deleteMutation.isPending &&
                              deleteMutation.variables === e.id
                            }
                          >
                            {deleteMutation.isPending &&
                            deleteMutation.variables === e.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </JmIconButton>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </JmDrawerBody>
        <div className="flex items-center justify-end border-t border-[var(--jm-border)] px-5 py-3">
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
  subtle,
}: {
  label: React.ReactNode;
  amount: number;
  negative?: boolean;
  subtle?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pl-4 py-1">
      <span className={subtle ? "text-[var(--jm-text-muted)]" : "text-[var(--jm-text)]"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          subtle ? "text-[var(--jm-text-muted)]" : "text-[var(--jm-text)]"
        }`}
      >
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
