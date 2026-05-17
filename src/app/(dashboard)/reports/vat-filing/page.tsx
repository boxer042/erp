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
  jmButtonVariants,
} from "@/jm";
import { Info, FileText, Download, Building2, User, HelpCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface CustomerVatRow {
  customerId: string;
  customerName: string;
  businessNumber: string | null;
  type: "BUSINESS" | "INDIVIDUAL";
  supplyAmount: number;
  vatAmount: number;
}

interface SupplierVatRow {
  supplierId: string;
  supplierName: string;
  businessNumber: string | null;
  supplyAmount: number;
  vatAmount: number;
}

interface ExpenseVatRow {
  category: string;
  supplyAmount: number;
  vatAmount: number;
}

interface VatFilingReport {
  period: { from: string; to: string; label: string };
  summary: {
    outputVatTotal: number;
    inputVatTotal: number;
    estimatedPayable: number;
  };
  sales: {
    activeSupply: number;
    activeVat: number;
    refundSupply: number;
    refundVat: number;
    exchangeSupply: number;
    exchangeVat: number;
    cancelSupply: number;
    cancelVat: number;
    partialRefundSupply: number;
    partialRefundVat: number;
    netVat: number;
    businessTotal: { supplyAmount: number; vatAmount: number; count: number };
    individualTotal: { supplyAmount: number; vatAmount: number; count: number };
    byCustomer: CustomerVatRow[];
  };
  purchases: {
    incomingSupply: number;
    incomingVat: number;
    incomingCostVat: number;
    shippingVat: number;
    returnVat: number;
    expenseSupply: number;
    expenseVat: number;
    netVat: number;
    bySupplier: SupplierVatRow[];
    byExpense: ExpenseVatRow[];
  };
  deferredVat: {
    receipts: { mixed: number; supplyOnly: number; vatOnly: number };
    payments: { mixed: number; supplyOnly: number; vatOnly: number };
  };
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

type QuarterKey = string; // "2026-1" 형식

function getQuarterOptions() {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;

  const options: { value: string; label: string }[] = [];
  // 이번 분기 + 직전 4분기까지
  for (let i = 0; i < 5; i++) {
    let yy = y;
    let qq = q - i;
    while (qq <= 0) {
      qq += 4;
      yy -= 1;
    }
    options.push({
      value: `${yy}-${qq}`,
      label: i === 0 ? `이번 분기 (${yy}년 ${qq}Q)` : `${yy}년 ${qq}Q`,
    });
  }
  return options;
}

function formatWon(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function formatBusinessNumber(bn: string | null): string {
  if (!bn) return "";
  const digits = bn.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return bn;
}

export default function VatFilingPage() {
  const quarterOptions = useMemo(() => getQuarterOptions(), []);
  const [quarterKey, setQuarterKey] = useState<QuarterKey>(quarterOptions[0].value);

  const [year, quarter] = useMemo(() => {
    const [y, q] = quarterKey.split("-").map(Number);
    return [y, q];
  }, [quarterKey]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.reports.vatFiling({ year, quarter }),
    queryFn: () =>
      apiGet<VatFilingReport>(
        `/api/reports/vat-filing?year=${year}&quarter=${quarter}`,
      ),
  });

  const handleExportCSV = () => {
    if (!data) return;
    const rows: { item: string; supply: number | string; vat: number | string }[] = [];
    rows.push({ item: `[부가세 신고 자료 — ${data.period.label}]`, supply: "", vat: "" });
    rows.push({ item: "", supply: "공급가액", vat: "부가세" });
    rows.push({ item: "[매출]", supply: "", vat: "" });
    rows.push({
      item: "  활성 매출",
      supply: data.sales.activeSupply,
      vat: data.sales.activeVat,
    });
    if (data.sales.refundVat > 0)
      rows.push({
        item: "  반품 (RETURNED)",
        supply: -data.sales.refundSupply,
        vat: -data.sales.refundVat,
      });
    if (data.sales.exchangeVat > 0)
      rows.push({
        item: "  교환 (EXCHANGED)",
        supply: -data.sales.exchangeSupply,
        vat: -data.sales.exchangeVat,
      });
    if (data.sales.cancelVat > 0)
      rows.push({
        item: "  매출 취소",
        supply: -data.sales.cancelSupply,
        vat: -data.sales.cancelVat,
      });
    if (data.sales.partialRefundVat > 0)
      rows.push({
        item: "  부분 환불",
        supply: -data.sales.partialRefundSupply,
        vat: -data.sales.partialRefundVat,
      });
    rows.push({
      item: "매출 부가세 (예수금)",
      supply: "",
      vat: data.summary.outputVatTotal,
    });
    rows.push({ item: "", supply: "", vat: "" });

    rows.push({ item: "[매입]", supply: "", vat: "" });
    rows.push({
      item: "  입고 품목",
      supply: data.purchases.incomingSupply,
      vat: data.purchases.incomingVat,
    });
    if (data.purchases.incomingCostVat > 0)
      rows.push({ item: "  입고 부대비용", supply: "", vat: data.purchases.incomingCostVat });
    if (data.purchases.shippingVat > 0)
      rows.push({ item: "  입고 배송비", supply: "", vat: data.purchases.shippingVat });
    if (data.purchases.returnVat > 0)
      rows.push({
        item: "  입고 반품 (차감)",
        supply: "",
        vat: -data.purchases.returnVat,
      });
    rows.push({
      item: "  과세 경비",
      supply: data.purchases.expenseSupply,
      vat: data.purchases.expenseVat,
    });
    rows.push({
      item: "매입 부가세 (대급금)",
      supply: "",
      vat: data.summary.inputVatTotal,
    });
    rows.push({ item: "", supply: "", vat: "" });
    rows.push({
      item: data.summary.estimatedPayable < 0 ? "예상 환급액" : "예상 납부액",
      supply: "",
      vat: Math.abs(data.summary.estimatedPayable),
    });

    rows.push({ item: "", supply: "", vat: "" });
    rows.push({ item: "[매출 — 거래처별 (사업자 우선)]", supply: "", vat: "" });
    for (const c of data.sales.byCustomer) {
      rows.push({
        item: `  ${c.customerName}${c.businessNumber ? ` (${formatBusinessNumber(c.businessNumber)})` : ""}${c.type === "BUSINESS" ? " [사업자]" : ""}`,
        supply: c.supplyAmount,
        vat: c.vatAmount,
      });
    }

    rows.push({ item: "", supply: "", vat: "" });
    rows.push({ item: "[매입 — 거래처별]", supply: "", vat: "" });
    for (const s of data.purchases.bySupplier) {
      rows.push({
        item: `  ${s.supplierName}${s.businessNumber ? ` (${formatBusinessNumber(s.businessNumber)})` : ""}`,
        supply: s.supplyAmount,
        vat: s.vatAmount,
      });
    }

    const csv = toCSV(rows, [
      { key: "item", label: "항목" },
      { key: "supply", label: "공급가액" },
      { key: "vat", label: "부가세" },
    ]);
    downloadCSV(`부가세신고_${year}년${quarter}분기.csv`, csv);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-jm-2xl font-bold text-[var(--jm-text)]">
              부가세 신고 자료
            </h1>
            <p className="mt-1 text-jm-sm text-[var(--jm-text-muted)]">
              {data?.period.label ?? "—"} · 매출·매입 부가세 상세 (세무사 전달용)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JmSegmentedControl<string>
              value={quarterKey}
              onChange={setQuarterKey}
              size="sm"
              options={quarterOptions}
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
            <Link
              href="/reports/help"
              className={jmButtonVariants({ variant: "ghost", size: "sm" })}
            >
              <HelpCircle className="size-4" />
              도움말
            </Link>
          </div>
        </div>

        {/* 안내 */}
        <JmAlert variant="info" icon={<Info className="size-4" />}>
          <div className="flex flex-col gap-0.5">
            <span>
              <span className="font-semibold">일반과세자 분기 신고 자료</span>입니다. 환불·교환·취소·부분환불을 모두
              반영한 정확한 부가세 누적분이에요.
            </span>
            <span className="text-jm-xs">
              세무사·홈택스 입력 시 참고. 사업자번호 있는 고객 매출은 세금계산서 발행 대상.
            </span>
          </div>
        </JmAlert>

        {isError && (
          <JmAlert variant="danger">
            {error instanceof Error ? error.message : "자료를 불러오지 못했습니다."}
          </JmAlert>
        )}

        {/* KPI 3개 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {isPending || !data ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <JmStat
                label="매출 부가세 (예수금)"
                value={formatWon(data.summary.outputVatTotal)}
                hint="고객에게 받아둔 부가세"
              />
              <JmStat
                label="매입 부가세 (대급금)"
                value={formatWon(data.summary.inputVatTotal)}
                hint="거래처/경비에 낸 부가세"
              />
              <JmStat
                label={data.summary.estimatedPayable < 0 ? "예상 환급액" : "예상 납부액"}
                value={formatWon(Math.abs(data.summary.estimatedPayable))}
                hint={
                  data.summary.estimatedPayable < 0
                    ? "대급금 > 예수금 → 환급"
                    : "예수금 − 대급금"
                }
                positiveIsGood={false}
              />
            </>
          )}
        </div>

        {/* 매출 부가세 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
              <FileText className="size-4 text-[var(--jm-text-muted)]" />
              매출 부가세 (예수금)
            </h2>
          </div>
          <div className="px-5 py-4">
            {isPending || !data ? (
              <BodySkeleton lines={6} />
            ) : (
              <div className="text-jm-sm">
                <Row
                  label="활성 매출"
                  supply={data.sales.activeSupply}
                  vat={data.sales.activeVat}
                />
                {data.sales.refundVat > 0 && (
                  <Row
                    label="반품 (RETURNED)"
                    supply={-data.sales.refundSupply}
                    vat={-data.sales.refundVat}
                    negative
                  />
                )}
                {data.sales.exchangeVat > 0 && (
                  <Row
                    label="교환 (EXCHANGED)"
                    supply={-data.sales.exchangeSupply}
                    vat={-data.sales.exchangeVat}
                    negative
                  />
                )}
                {data.sales.cancelVat > 0 && (
                  <Row
                    label="매출 취소 (외상 반품)"
                    supply={-data.sales.cancelSupply}
                    vat={-data.sales.cancelVat}
                    negative
                  />
                )}
                {data.sales.partialRefundVat > 0 && (
                  <Row
                    label="부분 환불"
                    supply={-data.sales.partialRefundSupply}
                    vat={-data.sales.partialRefundVat}
                    negative
                  />
                )}
                <BigRow
                  label="매출 부가세 합계 (예수금)"
                  vat={data.summary.outputVatTotal}
                />

                {/* 사업자 vs 개인 요약 */}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SummaryMiniCard
                    icon={<Building2 className="size-4" />}
                    label="사업자 (세금계산서 대상)"
                    supplyAmount={data.sales.businessTotal.supplyAmount}
                    vatAmount={data.sales.businessTotal.vatAmount}
                    count={data.sales.businessTotal.count}
                  />
                  <SummaryMiniCard
                    icon={<User className="size-4" />}
                    label="개인 (현금영수증/미발행)"
                    supplyAmount={data.sales.individualTotal.supplyAmount}
                    vatAmount={data.sales.individualTotal.vatAmount}
                    count={data.sales.individualTotal.count}
                  />
                </div>
              </div>
            )}
          </div>
        </JmCard>

        {/* 매입 부가세 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="flex items-center gap-2 text-jm-base font-semibold text-[var(--jm-text)]">
              <FileText className="size-4 text-[var(--jm-text-muted)]" />
              매입 부가세 (대급금)
            </h2>
          </div>
          <div className="px-5 py-4">
            {isPending || !data ? (
              <BodySkeleton lines={6} />
            ) : (
              <div className="text-jm-sm">
                <Row
                  label="입고 품목"
                  supply={data.purchases.incomingSupply}
                  vat={data.purchases.incomingVat}
                />
                {data.purchases.incomingCostVat > 0 && (
                  <Row
                    label="입고 부대비용 (통관·검수 등)"
                    supply={null}
                    vat={data.purchases.incomingCostVat}
                  />
                )}
                {data.purchases.shippingVat > 0 && (
                  <Row
                    label="입고 배송비"
                    supply={null}
                    vat={data.purchases.shippingVat}
                  />
                )}
                {data.purchases.returnVat > 0 && (
                  <Row
                    label="입고 반품 차감"
                    supply={null}
                    vat={-data.purchases.returnVat}
                    negative
                  />
                )}
                <Row
                  label="과세 경비"
                  supply={data.purchases.expenseSupply}
                  vat={data.purchases.expenseVat}
                />
                <BigRow
                  label="매입 부가세 합계 (대급금)"
                  vat={data.summary.inputVatTotal}
                />
              </div>
            )}
          </div>
        </JmCard>

        {/* 거래처별 매출 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
              매출 — 거래처별
            </h2>
            <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
              부분환불 차감 후 잔액 · 사업자번호 있으면 세금계산서 발행 대상
            </p>
          </div>
          <div className="px-5 py-4">
            {isPending || !data ? (
              <BodySkeleton lines={6} />
            ) : data.sales.byCustomer.length === 0 ? (
              <EmptyRow>매출 데이터가 없습니다.</EmptyRow>
            ) : (
              <CustomerTable rows={data.sales.byCustomer} />
            )}
          </div>
        </JmCard>

        {/* 거래처별 매입 */}
        <JmCard>
          <div className="border-b border-[var(--jm-border)] px-5 py-3">
            <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
              매입 — 거래처별
            </h2>
            <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
              입고·부대비용·배송비·반품 모두 반영
            </p>
          </div>
          <div className="px-5 py-4">
            {isPending || !data ? (
              <BodySkeleton lines={6} />
            ) : data.purchases.bySupplier.length === 0 ? (
              <EmptyRow>매입 데이터가 없습니다.</EmptyRow>
            ) : (
              <SupplierTable rows={data.purchases.bySupplier} />
            )}
          </div>
        </JmCard>

        {/* 카테고리별 경비 */}
        {data && data.purchases.byExpense.length > 0 && (
          <JmCard>
            <div className="border-b border-[var(--jm-border)] px-5 py-3">
              <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
                매입 — 경비 카테고리별
              </h2>
            </div>
            <div className="px-5 py-4">
              <ExpenseTable rows={data.purchases.byExpense} />
            </div>
          </JmCard>
        )}

        {/* 부가세 후납 결제 현황 */}
        {data &&
          (data.deferredVat.receipts.supplyOnly > 0 ||
            data.deferredVat.receipts.vatOnly > 0 ||
            data.deferredVat.payments.supplyOnly > 0 ||
            data.deferredVat.payments.vatOnly > 0) && (
            <JmCard>
              <div className="border-b border-[var(--jm-border)] px-5 py-3">
                <h2 className="text-jm-base font-semibold text-[var(--jm-text)]">
                  부가세 후납 결제 현황
                </h2>
                <p className="mt-0.5 text-jm-xs text-[var(--jm-text-muted)]">
                  이 분기 결제·수금을 종류별로 분류 — 공급가액만 / 부가세만 받은 건 추적
                </p>
              </div>
              <div className="px-5 py-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <DeferredVatBlock
                    title="고객 수금 (매출 측)"
                    data={data.deferredVat.receipts}
                  />
                  <DeferredVatBlock
                    title="거래처 결제 (매입 측)"
                    data={data.deferredVat.payments}
                  />
                </div>
                <p className="mt-3 text-jm-2xs text-[var(--jm-text-muted)]">
                  ※ &quot;공급가액만&quot; 결제가 있으면 해당 거래의 부가세가 아직 미정산일 수
                  있습니다. 거래처/고객 원장에서 종류 배지로 개별 확인 가능.
                </p>
              </div>
            </JmCard>
          )}
      </div>
    </div>
  );
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────

function Row({
  label,
  supply,
  vat,
  negative,
}: {
  label: React.ReactNode;
  supply: number | null;
  vat: number;
  negative?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-8 border-b border-[var(--jm-border)] py-2 last:border-b-0">
      <span className="pl-2 text-[var(--jm-text)]">{label}</span>
      <span className="w-28 text-right tabular-nums text-[var(--jm-text-muted)]">
        {supply === null
          ? "—"
          : negative && supply !== 0
            ? `(${formatWon(Math.abs(supply))})`
            : formatWon(supply)}
      </span>
      <span
        className={`w-28 text-right tabular-nums ${
          negative ? "text-[var(--jm-warning-fg)]" : "text-[var(--jm-text)]"
        }`}
      >
        {negative && vat !== 0
          ? `(${formatWon(Math.abs(vat))})`
          : formatWon(vat)}
      </span>
    </div>
  );
}

function BigRow({ label, vat }: { label: string; vat: number }) {
  return (
    <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-8 rounded-lg border border-[var(--jm-action)] bg-[var(--jm-surface-muted)] px-2 py-2.5">
      <span className="font-bold text-[var(--jm-text)]">{label}</span>
      <span className="w-28 text-right tabular-nums text-[var(--jm-text-muted)]">—</span>
      <span className="w-28 text-right text-jm-base font-bold tabular-nums text-[var(--jm-text)]">
        {formatWon(vat)}
      </span>
    </div>
  );
}

function SummaryMiniCard({
  icon,
  label,
  supplyAmount,
  vatAmount,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  supplyAmount: number;
  vatAmount: number;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
      <div className="flex items-center gap-1.5 text-jm-xs font-medium text-[var(--jm-text-muted)]">
        {icon}
        <span>
          {label} ({count}명)
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-jm-2xs text-[var(--jm-text-muted)]">공급</span>
        <span className="tabular-nums text-[var(--jm-text)]">{formatWon(supplyAmount)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-jm-2xs text-[var(--jm-text-muted)]">부가세</span>
        <span className="font-semibold tabular-nums text-[var(--jm-text)]">
          {formatWon(vatAmount)}
        </span>
      </div>
    </div>
  );
}

function CustomerTable({ rows }: { rows: CustomerVatRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-jm-xs text-[var(--jm-text-muted)]">
            <th className="px-2 py-2 text-left font-medium">고객</th>
            <th className="px-2 py-2 text-left font-medium">사업자번호</th>
            <th className="px-2 py-2 text-left font-medium">구분</th>
            <th className="px-2 py-2 text-right font-medium">공급가액</th>
            <th className="px-2 py-2 text-right font-medium">부가세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.customerId || c.customerName}
              className="border-b border-[var(--jm-border)] last:border-b-0"
            >
              <td className="px-2 py-2 text-[var(--jm-text)]">{c.customerName}</td>
              <td className="px-2 py-2 font-mono text-jm-xs text-[var(--jm-text-muted)]">
                {formatBusinessNumber(c.businessNumber)}
              </td>
              <td className="px-2 py-2">
                <JmBadge variant={c.type === "BUSINESS" ? "info" : "default"} size="sm">
                  {c.type === "BUSINESS" ? "사업자" : "개인"}
                </JmBadge>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                {formatWon(c.supplyAmount)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
                {formatWon(c.vatAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SupplierTable({ rows }: { rows: SupplierVatRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-jm-xs text-[var(--jm-text-muted)]">
            <th className="px-2 py-2 text-left font-medium">거래처</th>
            <th className="px-2 py-2 text-left font-medium">사업자번호</th>
            <th className="px-2 py-2 text-right font-medium">공급가액</th>
            <th className="px-2 py-2 text-right font-medium">부가세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.supplierId}
              className="border-b border-[var(--jm-border)] last:border-b-0"
            >
              <td className="px-2 py-2 text-[var(--jm-text)]">{s.supplierName}</td>
              <td className="px-2 py-2 font-mono text-jm-xs text-[var(--jm-text-muted)]">
                {formatBusinessNumber(s.businessNumber)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                {formatWon(s.supplyAmount)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
                {formatWon(s.vatAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseTable({ rows }: { rows: ExpenseVatRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-jm-sm">
        <thead>
          <tr className="border-b border-[var(--jm-border)] text-jm-xs text-[var(--jm-text-muted)]">
            <th className="px-2 py-2 text-left font-medium">카테고리</th>
            <th className="px-2 py-2 text-right font-medium">공급가액</th>
            <th className="px-2 py-2 text-right font-medium">부가세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={e.category}
              className="border-b border-[var(--jm-border)] last:border-b-0"
            >
              <td className="px-2 py-2 text-[var(--jm-text)]">
                {CATEGORY_LABELS[e.category] ?? e.category}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[var(--jm-text-muted)]">
                {formatWon(e.supplyAmount)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-[var(--jm-text)]">
                {formatWon(e.vatAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeferredVatBlock({
  title,
  data,
}: {
  title: string;
  data: { mixed: number; supplyOnly: number; vatOnly: number };
}) {
  const total = data.mixed + data.supplyOnly + data.vatOnly;
  return (
    <div className="rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-4">
      <div className="text-jm-sm font-semibold text-[var(--jm-text)]">{title}</div>
      <div className="mt-2 flex flex-col gap-1.5 text-jm-sm">
        <div className="flex items-center justify-between">
          <span className="text-[var(--jm-text-muted)]">전체 (공급가액+부가세)</span>
          <span className="tabular-nums text-[var(--jm-text)]">{formatWon(data.mixed)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[var(--jm-text-muted)]">
            <JmBadge variant="warning" size="sm">
              공급가액만
            </JmBadge>
          </span>
          <span className="tabular-nums font-medium text-[var(--jm-warning-fg)]">
            {formatWon(data.supplyOnly)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[var(--jm-text-muted)]">
            <JmBadge variant="info" size="sm">
              부가세만
            </JmBadge>
          </span>
          <span className="tabular-nums font-medium text-[var(--jm-info-fg)]">
            {formatWon(data.vatOnly)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-[var(--jm-border)] pt-1.5">
          <span className="font-semibold text-[var(--jm-text)]">합계</span>
          <span className="font-semibold tabular-nums text-[var(--jm-text)]">
            {formatWon(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">{children}</div>
  );
}

function KpiSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-5">
      <JmSkeleton className="h-3 w-32" />
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
          <JmSkeleton className="h-4 w-40" />
          <JmSkeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
