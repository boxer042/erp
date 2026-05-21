"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Plus, Search, SlidersHorizontal, FileEdit, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "next-themes";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDateRangePicker,
  JmScope,
  JmScrollArea,
  JmSkeleton,
  JmSpinner,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { cn } from "@/lib/utils";
import { CustomerPaymentDialog } from "@/components/customer-payment-dialog";
import { CustomerAdjustmentDialog } from "@/components/customer-adjustment-dialog";
import { type PaymentMethod } from "@/lib/validators/supplier";
import { startOfMonth, endOfMonth, format } from "date-fns";

import {
  ALL_TYPES,
  REFUND_METHOD_LABELS,
  TYPE_JM_VARIANTS,
  TYPE_LABELS,
  type DatePreset,
  type LedgerEntry,
  type LedgerResponse,
  type LedgerType,
} from "./_types";
import {
  applyDatePreset,
  buildLedgerDateGroups,
  formatAmount,
  getCurrentPresetLabel,
} from "./_helpers";
import { LedgerView } from "./_views";

export default function CustomerLedgerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  // 모바일/좁은 화면에서 좌측 패널 접기 토글 (기본: 펼침)
  const [panelOpen, setPanelOpen] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<Date | undefined>(startOfMonth(now));
  const [to, setTo] = useState<Date | undefined>(endOfMonth(now));

  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<LedgerType[]>([...ALL_TYPES]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<{
    id: string;
    customer: { id: string; name: string };
    amount: string;
    paymentDate: string;
    method: PaymentMethod;
    kind: "MIXED" | "SUPPLY_ONLY" | "VAT_ONLY";
    memo: string | null;
  } | null>(null);

  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<{
    id: string;
    customer: { id: string; name: string };
    amount: string;
    date: string;
    memo: string | null;
  } | null>(null);

  const ledgerQuery = useQuery({
    queryKey: queryKeys.ledger.customers({
      from: from?.toISOString(),
      to: to?.toISOString(),
      types: types.join(","),
      search,
      selectedCustomerId,
    }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) {
        const toInclusive = new Date(to);
        toInclusive.setDate(toInclusive.getDate() + 1);
        params.set("to", toInclusive.toISOString());
      }
      if (types.length < ALL_TYPES.length) params.set("types", types.join(","));
      if (search && !selectedCustomerId) params.set("q", search);
      if (selectedCustomerId) params.set("customerId", selectedCustomerId);
      return apiGet<LedgerResponse>(`/api/customers/ledger?${params}`);
    },
  });
  const data: LedgerResponse = ledgerQuery.data ?? { entries: [], refunds: [], customerSummaries: [] };
  const loading = ledgerQuery.isPending;
  const fetchLedger = () => queryClient.invalidateQueries({ queryKey: queryKeys.ledger.customers() });

  const applyPreset = (preset: DatePreset) => {
    const { from: nextFrom, to: nextTo } = applyDatePreset(preset, now);
    setFrom(nextFrom);
    setTo(nextTo);
  };

  const currentPresetLabel = getCurrentPresetLabel(from, to, now);

  const filteredSummaries = data.customerSummaries.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      return c.customerName.toLowerCase().includes(q);
    }
    return true;
  });

  const onEntryDoubleClick = (e: LedgerEntry) => {
    if (e.type === "RECEIPT" && e.referenceType === "CUSTOMER_PAYMENT" && e.referenceId) {
      apiGet<{
        id: string;
        customer: { id: string; name: string };
        amount: string;
        paymentDate: string;
        method: string;
        kind?: "MIXED" | "SUPPLY_ONLY" | "VAT_ONLY";
        memo: string | null;
      }>(`/api/customer-payments/${e.referenceId}`).then((p) => {
        setEditingPayment({
          id: p.id,
          customer: { id: p.customer.id, name: p.customer.name },
          amount: p.amount,
          paymentDate: p.paymentDate,
          method: p.method as PaymentMethod,
          kind: p.kind ?? "MIXED",
          memo: p.memo,
        });
        setPayDialogOpen(true);
      });
      return;
    }
    if (e.type === "ADJUSTMENT" && e.referenceType === "MANUAL_ADJUSTMENT") {
      const signed =
        parseFloat(e.debitAmount) > 0
          ? parseFloat(e.debitAmount)
          : -parseFloat(e.creditAmount);
      setEditingAdjustment({
        id: e.id,
        customer: { id: e.customer.id, name: e.customer.name },
        amount: String(signed),
        date: e.date,
        memo: e.description.startsWith("조정 — ") ? e.description.slice(5) : null,
      });
      setAdjDialogOpen(true);
      return;
    }
    // 매출/환불 → 주문 상세 deeplink
    if ((e.type === "SALE" || e.type === "REFUND") && e.referenceType === "ORDER" && e.referenceId) {
      router.push(`/orders?id=${e.referenceId}`);
    }
  };

  const totalDebit = data.entries.reduce((s, e) => s + Number(e.debitAmount), 0);
  const totalCredit = data.entries.reduce((s, e) => s + Number(e.creditAmount), 0);

  const selectedCustomerSummary = selectedCustomerId
    ? data.customerSummaries.find((c) => c.customerId === selectedCustomerId)
    : null;

  const hasHiddenHistory =
    !!from &&
    (selectedCustomerSummary
      ? selectedCustomerSummary.openingBalance !== 0 ||
        selectedCustomerSummary.currentBalance !== 0
      : filteredSummaries.some((c) => c.currentBalance !== 0 || c.openingBalance !== 0));

  // CustomerRefund → LedgerEntry 모양으로 변환해 같은 테이블에 표시 (balance=null, 차변/대변=0)
  const refundRows: LedgerEntry[] = (data.refunds ?? []).map((r) => ({
    id: `refund-${r.id}`,
    date: r.refundedAt,
    type: "REFUND_LOG" as const,
    description: `환불 — ${REFUND_METHOD_LABELS[r.method] ?? r.method}${r.memo ? ` (${r.memo})` : ""}`,
    debitAmount: "0",
    creditAmount: r.amount,
    balance: "",
    referenceId: r.order.id,
    referenceType: r.order.orderNo,
    paymentKind: null,
    customer: r.customer,
  }));

  const dateGroups = buildLedgerDateGroups([...data.entries, ...refundRows]);

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex h-full">
        {/* ─── 좌측 패널 ─── */}
        {panelOpen && (
        <div className="w-[320px] max-md:w-[280px] shrink-0 border-r border-[var(--jm-border)] flex flex-col bg-[var(--jm-bg)]">
          <div className="h-10 px-3 border-b border-[var(--jm-border)] flex items-center shrink-0">
            <h2 className="text-sm font-medium">고객 원장</h2>
          </div>

          <div className="px-3 pt-2 shrink-0 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <JmButton
                size="sm"
                onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <Plus /><span>수금 등록</span>
              </JmButton>
              <JmButton
                size="sm"
                variant="outline"
                onClick={() => { setEditingAdjustment(null); setAdjDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <FileEdit className="size-3.5" /><span>조정 등록</span>
              </JmButton>
            </div>
          </div>

          <div className="px-3 pt-2 flex flex-wrap gap-1 shrink-0">
            {(["thisMonth", "lastMonth", "last3", "all"] as const).map((p) => {
              const labels = { thisMonth: "이번달", lastMonth: "지난달", last3: "최근3개월", all: "전체" };
              const active = currentPresetLabel === labels[p];
              return (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "px-2 h-6 rounded text-[11px] border transition-colors",
                    active
                      ? "bg-[var(--jm-info-bg)] border-[var(--jm-info-fg)]/40 text-[var(--jm-info-fg)]"
                      : "border-[var(--jm-border)] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="px-3 pt-2 pb-2 shrink-0">
            <JmDateRangePicker
              size="sm"
              value={{ from, to }}
              onChange={(range) => {
                setFrom(range?.from);
                setTo(range?.to);
              }}
              placeholder="전체 기간"
            />
          </div>

          <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 h-8 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2.5">
              <Search className="size-3.5 text-[var(--jm-text-muted)] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="고객 검색..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-[var(--jm-text-muted)]"
              />
            </div>
            <PopoverPrimitive.Root open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
              <PopoverPrimitive.Trigger
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border border-[var(--jm-border)] shrink-0 transition-colors",
                  types.length < ALL_TYPES.length
                    ? "bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)] border-[var(--jm-info-fg)]/30"
                    : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                )}
              >
                <SlidersHorizontal className="size-3.5" />
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Positioner align="end" sideOffset={4} className="isolate z-50">
                  <PopoverPrimitive.Popup
                    data-jm-scope
                    className="z-50 w-[180px] rounded-xl bg-[var(--jm-surface)] p-2 ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]"
                  >
                    <p className="text-xs text-[var(--jm-text-muted)] mb-2 px-1">유형 필터</p>
                    {ALL_TYPES.map((t) => {
                      const checked = types.includes(t);
                      return (
                        <label
                          key={t}
                          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs cursor-pointer text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] transition-colors"
                        >
                          <JmCheckbox
                            checked={checked}
                            onCheckedChange={() =>
                              setTypes((prev) =>
                                checked ? prev.filter((x) => x !== t) : [...prev, t],
                              )
                            }
                          />
                          <JmBadge variant={TYPE_JM_VARIANTS[t]} size="sm" shape="square">{TYPE_LABELS[t]}</JmBadge>
                        </label>
                      );
                    })}
                    {types.length < ALL_TYPES.length && (
                      <button className="w-full text-xs text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] mt-1.5 pt-1.5 border-t border-[var(--jm-border)]" onClick={() => setTypes([...ALL_TYPES])}>
                        전체 선택
                      </button>
                    )}
                  </PopoverPrimitive.Popup>
                </PopoverPrimitive.Positioner>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          </div>

          {loading ? (
            <div className="flex flex-1 min-h-0 items-center justify-center">
              <JmSpinner className="text-[var(--jm-text-muted)]" />
            </div>
          ) : (
          <JmScrollArea className="flex-1 min-h-0">
            <div
              onClick={() => setSelectedCustomerId(null)}
              className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedCustomerId === null ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">전체 거래</span>
                <span className="text-xs text-[var(--jm-text-muted)]">{data.entries.length}건</span>
              </div>
            </div>
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-[var(--jm-text-muted)] text-sm">
                {search.trim()
                  ? `"${search}" 검색 결과 없음`
                  : "고객이 없습니다"}
              </div>
            ) : (
              filteredSummaries.map((c) => {
                const bal = c.currentBalance;
                // 정상 미수(양수)·0 → 기본색. 과수금(음수, 비정상) → 빨강 강조
                const balColor = bal < 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text-muted)]";
                return (
                  <div
                    key={c.customerId}
                    onClick={() => setSelectedCustomerId(c.customerId)}
                    className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedCustomerId === c.customerId ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {c.customerType === "BUSINESS" && (
                          <span className="shrink-0 rounded-full bg-[var(--jm-warning-bg)] px-1.5 py-0 text-[9px] font-semibold text-[var(--jm-warning-fg)]">
                            기업
                          </span>
                        )}
                        <span className="text-sm truncate">{c.customerName}</span>
                      </div>
                      <span className={cn("text-xs tabular-nums shrink-0", balColor)}>
                        ₩{formatAmount(bal)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </JmScrollArea>
          )}
        </div>
        )}

        {/* ─── 우측 메인 ─── */}
        <div className="flex-1 flex flex-col min-w-0">
          {(() => {
            const totalBalance = selectedCustomerSummary
              ? selectedCustomerSummary.currentBalance
              : filteredSummaries.reduce((s, c) => s + c.currentBalance, 0);
            const openingTotal = selectedCustomerSummary
              ? selectedCustomerSummary.openingBalance
              : filteredSummaries.reduce((s, c) => s + c.openingBalance, 0);
            // 과수금(음수) 만 빨강. 정상 미수(양수)·0 은 기본색
            const balanceClass = totalBalance < 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]";
            return (
              <div className="min-h-10 px-4 border-b border-[var(--jm-border)] flex items-center flex-wrap gap-x-4 gap-y-1 py-1 text-xs text-[var(--jm-text-muted)] shrink-0">
                <button
                  type="button"
                  onClick={() => setPanelOpen((v) => !v)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] transition-colors -ml-1"
                  aria-label={panelOpen ? "사이드 패널 접기" : "사이드 패널 펼치기"}
                >
                  {panelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
                <span>기간: <b className="text-[var(--jm-text)]">{from ? format(from, "yyyy-MM-dd") : "제한 없음"} ~ {to ? format(to, "yyyy-MM-dd") : "제한 없음"}</b></span>
                <span className="text-[var(--jm-text-muted)]/50">|</span>
                {from && (
                  <>
                    <span>이월: <b className="text-[var(--jm-text)] tabular-nums">₩{formatAmount(openingTotal)}</b></span>
                    <span className="text-[var(--jm-text-muted)]/50">|</span>
                  </>
                )}
                <span>거래: <b className="text-[var(--jm-text)]">{data.entries.length}건</b></span>
                <span>차변 합 (매출): <b className="text-[var(--jm-text)]">₩{formatAmount(totalDebit)}</b></span>
                <span>대변 합 (수금): <b className="text-[var(--jm-text)]">₩{formatAmount(totalCredit)}</b></span>
                <span className="text-[var(--jm-text-muted)]/50">|</span>
                <span>미수금: <b className={cn("tabular-nums", balanceClass)}>₩{formatAmount(totalBalance)}</b></span>
              </div>
            );
          })()}

          {selectedCustomerSummary && (
            <div className="border-b border-[var(--jm-border)] px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3 shrink-0">
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">고객</p>
                <p className="text-sm font-medium">{selectedCustomerSummary.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">현재 미수금</p>
                <p className={cn("text-sm font-medium tabular-nums",
                  selectedCustomerSummary.currentBalance < 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]")}>
                  ₩{formatAmount(selectedCustomerSummary.currentBalance)}
                </p>
              </div>
              {from && (
                <div>
                  <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">이월 미수</p>
                  <p className="text-sm tabular-nums text-[var(--jm-text)]">
                    ₩{formatAmount(selectedCustomerSummary.openingBalance)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">기간 매출</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedCustomerSummary.totalSale)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">기간 수금</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedCustomerSummary.totalReceipt)}</p>
              </div>
              <div>
                <JmButton size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />수금 등록
                </JmButton>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <JmTable className="min-w-[900px] table-fixed border-b border-[var(--jm-border)]">
                <colgroup>
                  {!selectedCustomerId && <col style={{ width: "14%" }} />}
                  <col style={{ width: "70px" }} />
                  <col />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <JmTableHeader className="sticky top-0 z-10">
                  <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                    {!selectedCustomerId && <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">고객</JmTableHead>}
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">유형</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 font-medium">설명</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-center font-medium">참조</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">차변 (매출)</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">대변 (수금)</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-2 px-3 text-right font-medium">미수 잔액</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {Array.from({ length: 3 }).map((_, gi) => (
                    <React.Fragment key={`sk-group-${gi}`}>
                      <JmTableRow className="bg-[var(--jm-surface)] hover:bg-[var(--jm-surface)]">
                        <JmTableCell colSpan={selectedCustomerId ? 6 : 7} className="px-3 py-1.5">
                          <JmSkeleton className="h-3 w-24" />
                        </JmTableCell>
                      </JmTableRow>
                      {Array.from({ length: 3 }).map((_, ri) => (
                        <JmTableRow key={`sk-${gi}-${ri}`} className="hover:bg-transparent">
                          {!selectedCustomerId && (
                            <JmTableCell className="px-3 py-2.5"><JmSkeleton className="h-4 w-24" /></JmTableCell>
                          )}
                          <JmTableCell className="px-3 py-2.5 text-center">
                            <JmSkeleton className="h-5 w-12 rounded-md mx-auto" />
                          </JmTableCell>
                          <JmTableCell className="px-3 py-2.5"><JmSkeleton className="h-4 w-40" /></JmTableCell>
                          <JmTableCell className="px-3 py-2.5"><JmSkeleton className="h-4 w-16 mx-auto" /></JmTableCell>
                          <JmTableCell className="px-3 py-2.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div>
                          </JmTableCell>
                          <JmTableCell className="px-3 py-2.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div>
                          </JmTableCell>
                          <JmTableCell className="px-3 py-2.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-24" /></div>
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </JmTableBody>
              </JmTable>
            ) : dateGroups.length === 0 && !(from && selectedCustomerSummary) ? (
              <div className="text-center py-8 text-[var(--jm-text-muted)] text-sm">
                거래 내역이 없습니다
                {hasHiddenHistory ? (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-[11px] text-[var(--jm-text-muted)] max-w-[360px]">
                      선택한 기간에 거래가 없습니다. 과거 거래를 보려면 기간을 넓혀보세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => applyPreset("all")}
                      className="px-3 h-7 rounded-md border border-[var(--jm-info-fg)]/40 bg-[var(--jm-info-bg)] text-[var(--jm-info-fg)] text-[11px] hover:bg-[var(--jm-info-bg)]/80 transition-colors"
                    >
                      전체 기간 보기
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-[var(--jm-text-muted)]">
                    판매 시스템이 연동되면 매출(SALE) 원장이 자동 기록됩니다.
                    현재는 수동 수금/조정만 등록 가능합니다.
                  </p>
                )}
              </div>
            ) : (
              <LedgerView
                dateGroups={dateGroups}
                selectedCustomerId={selectedCustomerId}
                selectedCustomerSummary={selectedCustomerSummary}
                from={from}
                onEntryDoubleClick={onEntryDoubleClick}
              />
            )}
          </div>
        </div>
      </div>

      <CustomerPaymentDialog
        open={payDialogOpen}
        onOpenChange={(o) => { setPayDialogOpen(o); if (!o) setEditingPayment(null); }}
        fixedCustomer={
          editingPayment
            ? undefined
            : selectedCustomerId && selectedCustomerSummary
              ? { id: selectedCustomerSummary.customerId, name: selectedCustomerSummary.customerName }
              : undefined
        }
        initialPayment={editingPayment ?? undefined}
        onSaved={fetchLedger}
      />

      <CustomerAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={(o) => { setAdjDialogOpen(o); if (!o) setEditingAdjustment(null); }}
        fixedCustomer={
          editingAdjustment
            ? undefined
            : selectedCustomerId && selectedCustomerSummary
              ? { id: selectedCustomerSummary.customerId, name: selectedCustomerSummary.customerName }
              : undefined
        }
        initialAdjustment={editingAdjustment ?? undefined}
        onSaved={fetchLedger}
      />
    </JmScope>
  );
}
