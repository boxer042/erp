"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Plus, Search, SlidersHorizontal, Check, FileEdit, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerPaymentDialog } from "@/components/customer-payment-dialog";
import { CustomerAdjustmentDialog } from "@/components/customer-adjustment-dialog";
import { type PaymentMethod } from "@/lib/validators/supplier";
import { startOfMonth, endOfMonth, startOfDay, subMonths, format } from "date-fns";
import { ko } from "date-fns/locale";

type LedgerType = "SALE" | "RECEIPT" | "ADJUSTMENT" | "REFUND";

const TYPE_LABELS: Record<LedgerType, string> = {
  SALE: "매출",
  RECEIPT: "수금",
  ADJUSTMENT: "조정",
  REFUND: "환불",
};
const TYPE_VARIANTS: Record<LedgerType, "default" | "secondary" | "outline" | "destructive" | "warning" | "success"> = {
  SALE: "default",
  RECEIPT: "success",
  ADJUSTMENT: "secondary",
  REFUND: "destructive",
};
const ALL_TYPES: LedgerType[] = ["SALE", "RECEIPT", "ADJUSTMENT", "REFUND"];

interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerType;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  referenceId: string | null;
  referenceType: string | null;
  customer: { id: string; name: string };
}

interface CustomerSummary {
  customerId: string;
  customerName: string;
  currentBalance: number;
  openingBalance: number;
  totalSale: number;
  totalReceipt: number;
  totalAdjustment: number;
  totalRefund: number;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  customerSummaries: CustomerSummary[];
}

function formatAmount(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(v).toLocaleString("ko-KR");
}

export default function CustomerLedgerPage() {
  const [data, setData] = useState<LedgerResponse>({ entries: [], customerSummaries: [] });
  const [loading, setLoading] = useState(true);
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

  const fetchLedger = useCallback(async () => {
    setLoading(true);
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

    const res = await fetch(`/api/customers/ledger?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [from, to, types, search, selectedCustomerId]);

  useEffect(() => { fetchLedger(); }, [fetchLedger]);

  const applyPreset = (preset: "thisMonth" | "lastMonth" | "last3" | "all") => {
    if (preset === "thisMonth") {
      setFrom(startOfMonth(now));
      setTo(endOfMonth(now));
    } else if (preset === "lastMonth") {
      const last = subMonths(now, 1);
      setFrom(startOfMonth(last));
      setTo(endOfMonth(last));
    } else if (preset === "last3") {
      setFrom(startOfDay(subMonths(now, 3)));
      setTo(endOfMonth(now));
    } else {
      setFrom(undefined);
      setTo(undefined);
    }
  };

  const currentPresetLabel = (() => {
    if (!from && !to) return "전체";
    if (from && to) {
      const thisF = startOfMonth(now).getTime();
      const thisT = endOfMonth(now).getTime();
      if (from.getTime() === thisF && to.getTime() === thisT) return "이번달";
      const last = subMonths(now, 1);
      if (from.getTime() === startOfMonth(last).getTime() && to.getTime() === endOfMonth(last).getTime())
        return "지난달";
      if (from.getTime() === startOfDay(subMonths(now, 3)).getTime() && to.getTime() === endOfMonth(now).getTime())
        return "최근3개월";
    }
    return "커스텀";
  })();

  const filteredSummaries = data.customerSummaries.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      return c.customerName.toLowerCase().includes(q);
    }
    return true;
  });

  const onEntryDoubleClick = (e: LedgerEntry) => {
    if (e.type === "RECEIPT" && e.referenceType === "CUSTOMER_PAYMENT" && e.referenceId) {
      fetch(`/api/customer-payments/${e.referenceId}`)
        .then((r) => r.json())
        .then((p) => {
          setEditingPayment({
            id: p.id,
            customer: { id: p.customer.id, name: p.customer.name },
            amount: p.amount,
            paymentDate: p.paymentDate,
            method: p.method as PaymentMethod,
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

  const dateGroups = (() => {
    const map = new Map<string, LedgerEntry[]>();
    data.entries.forEach((e) => {
      const key = format(new Date(e.date), "yyyy-MM-dd");
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  return (
    <>
      <div className="flex h-full">
        {/* ─── 좌측 패널 ─── */}
        {panelOpen && (
        <div className="w-[320px] max-md:w-[280px] shrink-0 border-r border-border flex flex-col bg-background">
          <div className="h-10 px-3 border-b border-border flex items-center shrink-0">
            <h2 className="text-sm font-medium">고객 원장</h2>
          </div>

          <div className="px-3 pt-2 shrink-0 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <Plus /><span>수금 등록</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditingAdjustment(null); setAdjDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <FileEdit className="size-3.5" /><span>조정 등록</span>
              </Button>
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
                      ? "bg-primary/10 border-[#3ECF8E]/40 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="px-1 pt-1 shrink-0">
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={(range) => {
                setFrom(range?.from);
                setTo(range?.to);
              }}
              numberOfMonths={1}
              locale={ko}
              className="w-full"
            />
          </div>

          <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="고객 검색..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
              <PopoverTrigger
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border border-border shrink-0 transition-colors",
                  types.length < ALL_TYPES.length
                    ? "bg-primary/10 text-primary border-[#3ECF8E]/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <SlidersHorizontal className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent className="w-[180px] p-2" align="end">
                <p className="text-xs text-muted-foreground mb-2 px-1">유형 필터</p>
                {ALL_TYPES.map((t) => {
                  const checked = types.includes(t);
                  return (
                    <button
                      key={t}
                      className={cn(
                        "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs transition-colors",
                        checked ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                      onClick={() => setTypes((prev) => checked ? prev.filter((x) => x !== t) : [...prev, t])}
                    >
                      <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center", checked ? "bg-primary border-[#3ECF8E]" : "border-[#555]")}>
                        {checked && <Check className="size-2.5 text-foreground" />}
                      </div>
                      <Badge variant={TYPE_VARIANTS[t]} className="text-[10px]">{TYPE_LABELS[t]}</Badge>
                    </button>
                  );
                })}
                {types.length < ALL_TYPES.length && (
                  <button className="w-full text-xs text-muted-foreground hover:text-foreground mt-1.5 pt-1.5 border-t border-border" onClick={() => setTypes([...ALL_TYPES])}>
                    전체 선택
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div
              onClick={() => setSelectedCustomerId(null)}
              className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedCustomerId === null ? "bg-muted" : "hover:bg-muted/50")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">전체 거래</span>
                <span className="text-xs text-muted-foreground">{data.entries.length}건</span>
              </div>
            </div>
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">고객이 없습니다</div>
            ) : (
              filteredSummaries.map((c) => {
                const bal = c.currentBalance;
                // 양수 = 미수금 (받을 돈) → 빨강 강조
                const balColor = bal > 0 ? "text-red-400" : "text-muted-foreground";
                return (
                  <div
                    key={c.customerId}
                    onClick={() => setSelectedCustomerId(c.customerId)}
                    className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedCustomerId === c.customerId ? "bg-muted" : "hover:bg-muted/50")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm truncate">{c.customerName}</span>
                      <span className={cn("text-xs tabular-nums", balColor)}>
                        ₩{formatAmount(bal)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </ScrollArea>
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
            const balanceClass = totalBalance > 0 ? "text-red-400" : "text-foreground";
            return (
              <div className="min-h-10 px-4 border-b border-border flex items-center flex-wrap gap-x-4 gap-y-1 py-1 text-xs text-muted-foreground shrink-0">
                <button
                  type="button"
                  onClick={() => setPanelOpen((v) => !v)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -ml-1"
                  aria-label={panelOpen ? "사이드 패널 접기" : "사이드 패널 펼치기"}
                >
                  {panelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
                <span>기간: <b className="text-foreground">{from ? format(from, "yyyy-MM-dd") : "제한 없음"} ~ {to ? format(to, "yyyy-MM-dd") : "제한 없음"}</b></span>
                <span className="text-muted-foreground/50">|</span>
                {from && (
                  <>
                    <span>이월: <b className="text-foreground tabular-nums">₩{formatAmount(openingTotal)}</b></span>
                    <span className="text-muted-foreground/50">|</span>
                  </>
                )}
                <span>거래: <b className="text-foreground">{data.entries.length}건</b></span>
                <span>차변 합 (매출): <b className="text-foreground">₩{formatAmount(totalDebit)}</b></span>
                <span>대변 합 (수금): <b className="text-foreground">₩{formatAmount(totalCredit)}</b></span>
                <span className="text-muted-foreground/50">|</span>
                <span>미수금: <b className={cn("tabular-nums", balanceClass)}>₩{formatAmount(totalBalance)}</b></span>
              </div>
            );
          })()}

          {selectedCustomerSummary && (
            <div className="border-b border-border px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3 shrink-0">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">고객</p>
                <p className="text-sm font-medium">{selectedCustomerSummary.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">현재 미수금</p>
                <p className={cn("text-sm font-medium tabular-nums",
                  selectedCustomerSummary.currentBalance > 0 ? "text-red-400" : "text-foreground")}>
                  ₩{formatAmount(selectedCustomerSummary.currentBalance)}
                </p>
              </div>
              {from && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">이월 미수</p>
                  <p className="text-sm tabular-nums text-foreground">
                    ₩{formatAmount(selectedCustomerSummary.openingBalance)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">기간 매출</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedCustomerSummary.totalSale)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">기간 수금</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedCustomerSummary.totalReceipt)}</p>
              </div>
              <div>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />수금 등록
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div>
            ) : dateGroups.length === 0 && !(from && selectedCustomerSummary) ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                거래 내역이 없습니다
                {hasHiddenHistory ? (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <p className="text-[11px] text-muted-foreground max-w-[360px]">
                      선택한 기간에 거래가 없습니다. 과거 거래를 보려면 기간을 넓혀보세요.
                    </p>
                    <button
                      type="button"
                      onClick={() => applyPreset("all")}
                      className="px-3 h-7 rounded-md border border-[#3ECF8E]/40 bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors"
                    >
                      전체 기간 보기
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    판매 시스템이 연동되면 매출(SALE) 원장이 자동 기록됩니다.
                    현재는 수동 수금/조정만 등록 가능합니다.
                  </p>
                )}
              </div>
            ) : (
              <Table className="min-w-[900px] table-fixed">
                <colgroup>
                  {!selectedCustomerId && <col style={{ width: "14%" }} />}
                  <col style={{ width: "70px" }} />
                  <col />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-muted text-muted-foreground text-xs hover:bg-muted">
                    {!selectedCustomerId && <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">고객</TableHead>}
                    <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-center font-medium">유형</TableHead>
                    <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">설명</TableHead>
                    <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-center font-medium">참조</TableHead>
                    <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-right font-medium">차변 (매출)</TableHead>
                    <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-right font-medium">대변 (수금)</TableHead>
                    <TableHead className="border-b border-border h-auto py-1.5 px-2 text-right font-medium">미수 잔액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {from && selectedCustomerSummary && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell
                        colSpan={selectedCustomerId ? 5 : 6}
                        className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                      >
                        이월 잔액 ({format(from, "yyyy-MM-dd")} 기준)
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums text-primary">
                        ₩{formatAmount(selectedCustomerSummary.openingBalance)}
                      </TableCell>
                    </TableRow>
                  )}
                  {dateGroups.map(([date, rows]) => (
                    <React.Fragment key={`date-${date}`}>
                      <TableRow className="bg-card hover:bg-card">
                        <TableCell
                          colSpan={selectedCustomerId ? 6 : 7}
                          className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                        >
                          {date}
                        </TableCell>
                      </TableRow>
                      {rows.map((e) => {
                        const isReceipt = e.type === "RECEIPT" && e.referenceType === "CUSTOMER_PAYMENT";
                        const isManualAdj = e.type === "ADJUSTMENT" && e.referenceType === "MANUAL_ADJUSTMENT";
                        const isClickable = isReceipt || isManualAdj;
                        const title = isReceipt ? "더블클릭: 수금 수정" : isManualAdj ? "더블클릭: 조정 수정" : undefined;
                        return (
                          <TableRow
                            key={e.id}
                            className={cn(
                              !isClickable && "hover:bg-transparent",
                              isClickable && "cursor-pointer",
                            )}
                            title={title}
                            onDoubleClick={() => onEntryDoubleClick(e)}
                          >
                            {!selectedCustomerId && (
                              <TableCell className="border-r border-border px-2 py-1.5 truncate">{e.customer.name}</TableCell>
                            )}
                            <TableCell className="border-r border-border px-2 py-1.5 text-center">
                              <Badge variant={TYPE_VARIANTS[e.type]} className="text-[10px]">
                                {TYPE_LABELS[e.type]}
                              </Badge>
                            </TableCell>
                            <TableCell className="border-r border-border px-2 py-1.5 truncate">{e.description}</TableCell>
                            <TableCell className="border-r border-border px-2 py-1.5 text-center text-muted-foreground text-xs">
                              {e.referenceType ?? "-"}
                            </TableCell>
                            <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                              {parseFloat(e.debitAmount) > 0 ? `₩${formatAmount(e.debitAmount)}` : "-"}
                            </TableCell>
                            <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                              {parseFloat(e.creditAmount) > 0 ? `₩${formatAmount(e.creditAmount)}` : "-"}
                            </TableCell>
                            <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums">
                              ₩{formatAmount(e.balance)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
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
    </>
  );
}
