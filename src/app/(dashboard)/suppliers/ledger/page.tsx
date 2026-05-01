"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Plus, Search, SlidersHorizontal, Check, Printer, FileEdit, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import { SupplierAdjustmentDialog } from "@/components/supplier-adjustment-dialog";
import { type PaymentMethod } from "@/lib/validators/supplier";
import { startOfMonth, endOfMonth, startOfDay, subMonths, format } from "date-fns";
import { ko } from "date-fns/locale";

type LedgerType = "PURCHASE" | "PAYMENT" | "ADJUSTMENT" | "REFUND";

const TYPE_LABELS: Record<LedgerType, string> = {
  PURCHASE: "매입",
  PAYMENT: "결제",
  ADJUSTMENT: "조정",
  REFUND: "환급",
};
const TYPE_VARIANTS: Record<LedgerType, "default" | "secondary" | "outline" | "destructive" | "warning" | "success"> = {
  PURCHASE: "default",
  PAYMENT: "success",
  ADJUSTMENT: "secondary",
  REFUND: "destructive",
};
const ALL_TYPES: LedgerType[] = ["PURCHASE", "PAYMENT", "ADJUSTMENT", "REFUND"];

interface LedgerEntry {
  id: string;
  date: string;
  createdAt: string;
  type: LedgerType;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  referenceId: string | null;
  referenceType: string | null;
  supplier: { id: string; name: string };
}

interface SupplierSummary {
  supplierId: string;
  supplierName: string;
  currentBalance: number;
  openingBalance: number;
  totalPurchase: number;
  totalPayment: number;
  totalAdjustment: number;
  totalRefund: number;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  supplierSummaries: SupplierSummary[];
}

interface LedgerItem {
  id: string;
  incomingId: string;
  incomingNo: string;
  incomingDate: string;
  supplier: { id: string; name: string };
  supplierProduct: {
    id: string;
    name: string;
    spec: string | null;
    supplierCode: string | null;
    unitOfMeasure: string;
    isTaxable: boolean;
    mapped: boolean;
  };
  quantity: string;
  originalPrice: string | null;
  discountAmount: string | null;
  unitPrice: string;
  totalPrice: string;
  memo: string | null;
}

function formatAmount(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Math.round(v).toLocaleString("ko-KR");
}

type ViewMode = "ledger" | "items";

export default function SupplierLedgerPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("ledger");
  // 모바일/좁은 화면에서 좌측 패널 접기 토글 (기본: 펼침)
  const [panelOpen, setPanelOpen] = useState(true);
  const [data, setData] = useState<LedgerResponse>({ entries: [], supplierSummaries: [] });
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [paymentsInItems, setPaymentsInItems] = useState<LedgerEntry[]>([]);
  const [purchasesInItems, setPurchasesInItems] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<Date | undefined>(startOfMonth(now));
  const [to, setTo] = useState<Date | undefined>(endOfMonth(now));

  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<LedgerType[]>([...ALL_TYPES]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);

  // 결제 등록/수정 Dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<{
    id: string;
    supplier: { id: string; name: string };
    amount: string;
    paymentDate: string;
    method: PaymentMethod;
    memo: string | null;
  } | null>(null);

  // 조정 등록/수정 Dialog
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<{
    id: string;
    supplier: { id: string; name: string };
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
    if (search && !selectedSupplierId) params.set("q", search);
    if (selectedSupplierId) params.set("supplierId", selectedSupplierId);
    // 거래처 요약은 항상 원장 엔드포인트로 (좌측 잔액 표시용)
    const ledgerRes = await fetch(`/api/suppliers/ledger?${params}`);
    if (ledgerRes.ok) setData(await ledgerRes.json());

    if (viewMode === "items") {
      // 품목 뷰에서는 유형 필터와 무관하게 PAYMENT도 함께 표시
      const payParams = new URLSearchParams();
      if (from) payParams.set("from", from.toISOString());
      if (to) {
        const toInc = new Date(to);
        toInc.setDate(toInc.getDate() + 1);
        payParams.set("to", toInc.toISOString());
      }
      if (selectedSupplierId) payParams.set("supplierId", selectedSupplierId);
      else if (search) payParams.set("q", search);
      // 결제 + 배송비 차감/조정/환급까지 함께 (PURCHASE는 /items에서 옴)
      payParams.set("types", "PAYMENT,ADJUSTMENT,REFUND");

      // 매입 잔액 조회용 (유형 필터와 무관하게 PURCHASE도 항상 가져옴)
      const purParams = new URLSearchParams(payParams);
      purParams.set("types", "PURCHASE");

      const [itemsRes, paysRes, pursRes] = await Promise.all([
        fetch(`/api/suppliers/ledger/items?${params}`),
        fetch(`/api/suppliers/ledger?${payParams}`),
        fetch(`/api/suppliers/ledger?${purParams}`),
      ]);
      if (itemsRes.ok) {
        const payload = await itemsRes.json();
        setItems(payload.items);
      }
      if (paysRes.ok) {
        const payload = await paysRes.json();
        setPaymentsInItems(payload.entries);
      }
      if (pursRes.ok) {
        const payload = await pursRes.json();
        setPurchasesInItems(payload.entries);
      }
    }
    setLoading(false);
  }, [from, to, types, search, selectedSupplierId, viewMode]);

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

  const filteredSummaries = data.supplierSummaries.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return s.supplierName.toLowerCase().includes(q);
    }
    return true;
  });

  const onEntryDoubleClick = (e: LedgerEntry) => {
    if (e.type === "PAYMENT" && e.referenceType === "SUPPLIER_PAYMENT" && e.referenceId) {
      // 결제 수정 Dialog 열기
      fetch(`/api/supplier-payments/${e.referenceId}`)
        .then((r) => r.json())
        .then((p) => {
          setEditingPayment({
            id: p.id,
            supplier: { id: p.supplier.id, name: p.supplier.name },
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
      // 수동 조정 수정 Dialog
      const signed =
        parseFloat(e.debitAmount) > 0
          ? parseFloat(e.debitAmount)
          : -parseFloat(e.creditAmount);
      setEditingAdjustment({
        id: e.id,
        supplier: { id: e.supplier.id, name: e.supplier.name },
        amount: String(signed),
        date: e.date,
        memo: e.description.startsWith("조정 — ")
          ? e.description.slice(5)
          : null,
      });
      setAdjDialogOpen(true);
      return;
    }
    if ((e.type === "PURCHASE" || e.type === "REFUND") && e.referenceId) {
      // 입고 상세 페이지로 딥링크
      if (e.referenceType === "INCOMING" || e.type === "PURCHASE") {
        router.push(`/inventory/incoming?incomingId=${e.referenceId}`);
      }
    }
  };

  // 통계
  const totalDebit = data.entries.reduce((s, e) => s + Number(e.debitAmount), 0);
  const totalCredit = data.entries.reduce((s, e) => s + Number(e.creditAmount), 0);

  const selectedSupplierSummary = selectedSupplierId
    ? data.supplierSummaries.find((s) => s.supplierId === selectedSupplierId)
    : null;

  // 기간 필터로 가려진 과거 거래가 있는지 — 빈 상태 힌트용
  const hasHiddenHistory =
    !!from &&
    (selectedSupplierSummary
      ? selectedSupplierSummary.openingBalance !== 0 ||
        selectedSupplierSummary.currentBalance !== 0
      : filteredSummaries.some((s) => s.currentBalance !== 0 || s.openingBalance !== 0));

  const EmptyStateHint = () => (
    <div className="text-center py-8 text-muted-foreground text-sm">
      거래 내역이 없습니다
      {hasHiddenHistory && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <p className="text-[11px] text-muted-foreground max-w-[360px]">
            선택한 기간에 거래가 없습니다. 과거 거래를 보려면 기간을 넓혀보세요.
          </p>
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className="px-3 h-7 rounded-md border border-primary/40 bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors"
          >
            전체 기간 보기
          </button>
        </div>
      )}
    </div>
  );

  // 날짜별 그룹핑 — 원장 뷰
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

  // 매입 원장 엔트리 맵: incomingId → 해당 PURCHASE ledger entry
  const purchaseEntryByIncoming = new Map<string, LedgerEntry>();
  purchasesInItems.forEach((p) => {
    if (p.referenceId) purchaseEntryByIncoming.set(p.referenceId, p);
  });

  // 날짜별 그룹핑 — 품목 뷰 (품목 + 결제/조정/환급을 원장뷰와 동일한 순서로 섞음)
  type ItemViewRow =
    | { kind: "item"; data: LedgerItem; isLastInGroup: boolean; balance: number | null }
    | { kind: "payment"; data: LedgerEntry };

  const itemDateGroups = (() => {
    // incoming별 items 묶음 + 매입 엔트리의 createdAt을 정렬 키로 사용
    const itemsByIncoming = new Map<string, LedgerItem[]>();
    items.forEach((it) => {
      const arr = itemsByIncoming.get(it.incomingId) || [];
      arr.push(it);
      itemsByIncoming.set(it.incomingId, arr);
    });

    // 날짜 → 그룹(rows + 정렬키) 리스트
    type Group = { sortKey: number; rows: ItemViewRow[] };
    const dayMap = new Map<string, Group[]>();

    // 1) 각 incoming을 한 그룹으로 추가
    itemsByIncoming.forEach((its, incomingId) => {
      const purchaseEntry = purchaseEntryByIncoming.get(incomingId);
      // 키: 매입 엔트리가 있으면 그 createdAt, 없으면 incomingDate
      const dateBasis = purchaseEntry ? purchaseEntry.date : its[0].incomingDate;
      const sortKey = purchaseEntry
        ? new Date(purchaseEntry.createdAt).getTime()
        : new Date(its[0].incomingDate).getTime();
      const dayKey = format(new Date(dateBasis), "yyyy-MM-dd");
      const balance = purchaseEntry ? Number(purchaseEntry.balance) : null;
      const rows: ItemViewRow[] = its.map((it, idx) => ({
        kind: "item",
        data: it,
        isLastInGroup: idx === its.length - 1,
        balance: idx === its.length - 1 ? balance : null,
      }));
      const groups = dayMap.get(dayKey) || [];
      groups.push({ sortKey, rows });
      dayMap.set(dayKey, groups);
    });

    // 2) 결제/조정/환급은 각자 한 행 그룹으로 추가
    paymentsInItems.forEach((p) => {
      const dayKey = format(new Date(p.date), "yyyy-MM-dd");
      const sortKey = new Date(p.createdAt).getTime();
      const groups = dayMap.get(dayKey) || [];
      groups.push({ sortKey, rows: [{ kind: "payment", data: p }] });
      dayMap.set(dayKey, groups);
    });

    // 3) 같은 날짜 안에서 createdAt desc로 정렬 후 평탄화
    const flattened = new Map<string, ItemViewRow[]>();
    dayMap.forEach((groups, day) => {
      groups.sort((a, b) => b.sortKey - a.sortKey);
      flattened.set(day, groups.flatMap((g) => g.rows));
    });

    return Array.from(flattened.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  return (
    <>
      <div className="flex h-full">
        {/* ─── 좌측 패널 ─── */}
        {panelOpen && (
        <div className="w-[320px] max-md:w-[280px] shrink-0 border-r border-border flex flex-col bg-background">
          {/* 헤더 */}
          <div className="h-10 px-3 border-b border-border flex items-center shrink-0">
            <h2 className="text-sm font-medium">거래처 원장</h2>
          </div>

          {/* 등록 버튼들 */}
          <div className="px-3 pt-2 shrink-0 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                size="sm"
                onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <Plus /><span>결제 등록</span>
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
            <div className="flex gap-1.5">
              <Link
                href="/suppliers/initial-balance"
                className="flex-1 h-7 rounded-md border border-border bg-card hover:bg-muted text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
              >
                기초잔액 등록
              </Link>
              <button
                type="button"
                disabled={!selectedSupplierId}
                onClick={() => {
                  if (!selectedSupplierId) return;
                  const params = new URLSearchParams();
                  if (from) params.set("from", from.toISOString());
                  if (to) {
                    const toInc = new Date(to);
                    toInc.setDate(toInc.getDate() + 1);
                    params.set("to", toInc.toISOString());
                  }
                  params.set("auto", "1");
                  if (viewMode === "items") params.set("view", "items");
                  window.open(`/suppliers/ledger/${selectedSupplierId}/print?${params.toString()}`, "_blank");
                }}
                className={cn(
                  "flex-1 h-7 rounded-md border text-[11px] flex items-center justify-center gap-1 transition-colors",
                  selectedSupplierId
                    ? "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"
                    : "border-border bg-card opacity-40 cursor-not-allowed text-muted-foreground"
                )}
                title={
                  !selectedSupplierId
                    ? "거래처를 선택하세요"
                    : viewMode === "items"
                      ? "품목별 원장 PDF 출력"
                      : "거래처 원장 PDF 출력"
                }
              >
                <Printer className="size-3" /> PDF 출력 ({viewMode === "items" ? "품목" : "원장"})
              </button>
            </div>
          </div>

          {/* 뷰 전환 */}
          <div className="px-3 pt-2 shrink-0">
            <div className="flex h-8 rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("ledger")}
                className={cn(
                  "flex-1 text-xs font-medium transition-colors",
                  viewMode === "ledger"
                    ? "bg-secondary text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                원장 뷰
              </button>
              <button
                onClick={() => setViewMode("items")}
                className={cn(
                  "flex-1 text-xs font-medium transition-colors border-l border-border",
                  viewMode === "items"
                    ? "bg-secondary text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                품목별 뷰
              </button>
            </div>
          </div>

          {/* 기간 프리셋 */}
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
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          {/* 달력 */}
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

          {/* 검색 + 유형 필터 */}
          <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 h-8 rounded-md border border-border bg-card px-2.5">
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="거래처 검색..."
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
              <PopoverTrigger
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border border-border shrink-0 transition-colors",
                  types.length < ALL_TYPES.length
                    ? "bg-primary/10 text-primary border-primary/30"
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
                      <div className={cn("h-3.5 w-3.5 rounded border flex items-center justify-center", checked ? "bg-primary border-primary" : "border-input")}>
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

          {/* 거래처 목록 */}
          <ScrollArea className="flex-1 min-h-0">
            <div
              onClick={() => setSelectedSupplierId(null)}
              className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedSupplierId === null ? "bg-muted" : "hover:bg-muted/50")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">전체 거래</span>
                <span className="text-xs text-muted-foreground">{data.entries.length}건</span>
              </div>
            </div>
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">거래처가 없습니다</div>
            ) : (
              filteredSummaries.map((s) => {
                const bal = s.currentBalance;
                const balColor = bal < 0 ? "text-red-400" : "text-muted-foreground";
                return (
                  <div
                    key={s.supplierId}
                    onClick={() => setSelectedSupplierId(s.supplierId)}
                    className={cn("px-3 py-2.5 border-b border-border cursor-pointer transition-colors", selectedSupplierId === s.supplierId ? "bg-muted" : "hover:bg-muted/50")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm truncate">{s.supplierName}</span>
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
          {/* 상단 툴바 */}
          {(() => {
            const totalBalance = selectedSupplierSummary
              ? selectedSupplierSummary.currentBalance
              : filteredSummaries.reduce((s, sup) => s + sup.currentBalance, 0);
            const openingTotal = selectedSupplierSummary
              ? selectedSupplierSummary.openingBalance
              : filteredSummaries.reduce((s, sup) => s + sup.openingBalance, 0);
            const balanceClass = totalBalance < 0 ? "text-red-400" : "text-foreground";
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
                {viewMode === "ledger" ? (
                  <>
                    <span>거래: <b className="text-foreground">{data.entries.length}건</b></span>
                    <span>차변 합: <b className="text-foreground">₩{formatAmount(totalDebit)}</b></span>
                    <span>대변 합: <b className="text-foreground">₩{formatAmount(totalCredit)}</b></span>
                  </>
                ) : (
                  <>
                    <span>품목: <b className="text-foreground">{items.length}건</b></span>
                    <span>결제: <b className="text-foreground">{paymentsInItems.length}건</b></span>
                    <span>합계 합 (VAT 포함): <b className="text-foreground">₩{formatAmount(items.reduce((s, i) => {
                      const supply = parseFloat(i.totalPrice);
                      return s + (i.supplierProduct.isTaxable ? Math.round(supply * 1.1) : supply);
                    }, 0))}</b></span>
                    <span>결제 합: <b className="text-foreground">₩{formatAmount(paymentsInItems.reduce((s, p) => s + parseFloat(p.creditAmount), 0))}</b></span>
                  </>
                )}
                <span className="text-muted-foreground/50">|</span>
                <span>잔금: <b className={cn("tabular-nums", balanceClass)}>₩{formatAmount(totalBalance)}</b></span>
              </div>
            );
          })()}

          {/* 선택된 거래처 요약 */}
          {selectedSupplierSummary && (
            <div className="border-b border-border px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3 shrink-0">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">거래처</p>
                <p className="text-sm font-medium">{selectedSupplierSummary.supplierName}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">현재 잔액</p>
                <p className={cn("text-sm font-medium tabular-nums",
                  selectedSupplierSummary.currentBalance < 0 ? "text-red-400" : "text-foreground")}>
                  ₩{formatAmount(selectedSupplierSummary.currentBalance)}
                </p>
              </div>
              {from && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">이월 잔액</p>
                  <p className="text-sm tabular-nums text-foreground">
                    ₩{formatAmount(selectedSupplierSummary.openingBalance)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">기간 매입</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedSupplierSummary.totalPurchase)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">기간 결제</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedSupplierSummary.totalPayment)}</p>
              </div>
              <div>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />결제 등록
                </Button>
              </div>
            </div>
          )}

          {/* 테이블 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="ml-auto h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : viewMode === "ledger" ? (
              dateGroups.length === 0 ? (
                <EmptyStateHint />
              ) : (
                <Table className="min-w-[900px] table-fixed">
                  <colgroup>
                    {!selectedSupplierId && <col style={{ width: "14%" }} />}
                    <col style={{ width: "70px" }} />
                    <col />
                    <col style={{ width: "130px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "120px" }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-muted text-muted-foreground text-xs hover:bg-muted">
                      {!selectedSupplierId && <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">거래처</TableHead>}
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-center font-medium">유형</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">설명</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-center font-medium">참조</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-right font-medium">차변 (매입)</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 text-right font-medium">대변 (결제)</TableHead>
                      <TableHead className="border-b border-border h-auto py-1.5 px-2 text-right font-medium">잔액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {from && selectedSupplierSummary && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell
                          colSpan={selectedSupplierId ? 5 : 6}
                          className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                        >
                          이월 잔액 ({format(from, "yyyy-MM-dd")} 기준)
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums text-primary">
                          ₩{formatAmount(selectedSupplierSummary.openingBalance)}
                        </TableCell>
                      </TableRow>
                    )}
                    {dateGroups.map(([date, rows]) => (
                      <React.Fragment key={`date-${date}`}>
                        <TableRow className="bg-card hover:bg-card">
                          <TableCell
                            colSpan={selectedSupplierId ? 6 : 7}
                            className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                          >
                            {date}
                          </TableCell>
                        </TableRow>
                        {rows.map((e) => {
                          const isPayment = e.type === "PAYMENT" && e.referenceType === "SUPPLIER_PAYMENT";
                          const isManualAdj = e.type === "ADJUSTMENT" && e.referenceType === "MANUAL_ADJUSTMENT";
                          const isIncoming = (e.type === "PURCHASE" || e.type === "REFUND") && !!e.referenceId;
                          const isClickable = isPayment || isManualAdj || isIncoming;
                          const title = isPayment
                            ? "더블클릭: 결제 수정"
                            : isManualAdj
                              ? "더블클릭: 조정 수정"
                              : isIncoming
                                ? "더블클릭: 입고 상세"
                                : undefined;
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
                            {!selectedSupplierId && (
                              <TableCell className="border-r border-border px-2 py-1.5 truncate">{e.supplier.name}</TableCell>
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
              )
            ) : (
              // 품목별 뷰 (매입 품목 + 결제)
              itemDateGroups.length === 0 ? (
                <EmptyStateHint />
              ) : (
                <Table className="min-w-[900px] table-fixed">
                  <colgroup>
                    {!selectedSupplierId && <col style={{ width: "12%" }} />}
                    <col style={{ width: "110px" }} />
                    <col />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "50px" }} />
                    <col style={{ width: "70px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "120px" }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-muted text-muted-foreground text-xs hover:bg-muted">
                      {!selectedSupplierId && <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">거래처</TableHead>}
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">입고번호</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">품명</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 px-2 font-medium">규격</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">단위</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">수량</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">단가</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">할인</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">합계 (VAT포함)</TableHead>
                      <TableHead className="border-r border-b border-border h-auto py-1.5 text-center font-medium">입금</TableHead>
                      <TableHead className="border-b border-border h-auto py-1.5 text-center font-medium">잔액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {from && selectedSupplierSummary && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell
                          colSpan={selectedSupplierId ? 9 : 10}
                          className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                        >
                          이월 잔액 ({format(from, "yyyy-MM-dd")} 기준)
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums text-primary">
                          ₩{formatAmount(selectedSupplierSummary.openingBalance)}
                        </TableCell>
                      </TableRow>
                    )}
                    {itemDateGroups.map(([date, rows]) => (
                      <React.Fragment key={`item-date-${date}`}>
                        <TableRow className="bg-card hover:bg-card">
                          <TableCell
                            colSpan={selectedSupplierId ? 10 : 11}
                            className="px-3 py-1.5 text-xs text-muted-foreground font-medium"
                          >
                            {date}
                          </TableCell>
                        </TableRow>
                        {rows.map((row) => {
                          if (row.kind === "payment") {
                            const p = row.data;
                            const isPayment = p.type === "PAYMENT" && p.referenceType === "SUPPLIER_PAYMENT";
                            const isManualAdj = p.type === "ADJUSTMENT" && p.referenceType === "MANUAL_ADJUSTMENT";
                            const isClickable = isPayment || isManualAdj;
                            const title = isPayment
                              ? "더블클릭: 결제 수정"
                              : isManualAdj
                                ? "더블클릭: 조정 수정"
                                : undefined;
                            return (
                              <TableRow
                                key={`pay-${p.id}`}
                                className={cn(
                                  "bg-muted/50 hover:bg-muted/50",
                                  isClickable && "cursor-pointer",
                                )}
                                title={title}
                                onDoubleClick={() => onEntryDoubleClick(p)}
                              >
                                {!selectedSupplierId && (
                                  <TableCell className="border-r border-border px-2 py-1.5 truncate">{p.supplier.name}</TableCell>
                                )}
                                <TableCell className="border-r border-border px-2 py-1.5 text-center">
                                  <Badge variant={TYPE_VARIANTS[p.type]} className="text-[10px]">{TYPE_LABELS[p.type]}</Badge>
                                </TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-muted-foreground truncate">{p.description}</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-muted-foreground">—</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-center text-muted-foreground">—</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-right text-muted-foreground">—</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-right text-muted-foreground">—</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-right text-muted-foreground">—</TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                                  {parseFloat(p.debitAmount) > 0
                                    ? <span className="text-red-400">₩{formatAmount(p.debitAmount)}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                                  {parseFloat(p.creditAmount) > 0
                                    ? <span className="text-primary">₩{formatAmount(p.creditAmount)}</span>
                                    : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums">
                                  ₩{formatAmount(p.balance)}
                                </TableCell>
                              </TableRow>
                            );
                          }
                          const it = row.data;
                          const qty = parseFloat(it.quantity);
                          const up = parseFloat(it.unitPrice);
                          const origP = it.originalPrice ? parseFloat(it.originalPrice) : up;
                          const disc = origP > up ? origP - up : 0;
                          const supply = parseFloat(it.totalPrice);
                          const totalWithTax = it.supplierProduct.isTaxable
                            ? Math.round(supply * 1.1)
                            : supply;
                          return (
                            <TableRow
                              key={it.id}
                              className="cursor-pointer"
                              title="더블클릭: 입고 상세"
                              onDoubleClick={() => router.push(`/inventory/incoming?incomingId=${it.incomingId}`)}
                            >
                              {!selectedSupplierId && (
                                <TableCell className="border-r border-border px-2 py-1.5 truncate">{it.supplier.name}</TableCell>
                              )}
                              <TableCell className="border-r border-border px-2 py-1.5 text-xs text-muted-foreground truncate">{it.incomingNo}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 truncate">
                                <span className="font-medium">{it.supplierProduct.name}</span>
                                {it.supplierProduct.supplierCode && (
                                  <span className="ml-1 text-xs text-muted-foreground">({it.supplierProduct.supplierCode})</span>
                                )}
                              </TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-muted-foreground truncate">{it.supplierProduct.spec ?? ""}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-center text-muted-foreground">{it.supplierProduct.unitOfMeasure}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">{qty.toLocaleString("ko-KR")}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">{formatAmount(up)}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">
                                {disc > 0 ? <span className="text-red-400">-{formatAmount(disc)}</span> : ""}
                              </TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-right tabular-nums">{formatAmount(totalWithTax)}</TableCell>
                              <TableCell className="border-r border-border px-2 py-1.5 text-right text-muted-foreground">—</TableCell>
                              <TableCell className="px-2 py-1.5 text-right font-medium tabular-nums">
                                {row.balance !== null ? `₩${formatAmount(row.balance)}` : ""}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </div>
        </div>
      </div>

      <SupplierPaymentDialog
        open={payDialogOpen}
        onOpenChange={(o) => { setPayDialogOpen(o); if (!o) setEditingPayment(null); }}
        fixedSupplier={
          editingPayment
            ? undefined
            : selectedSupplierId && selectedSupplierSummary
              ? { id: selectedSupplierSummary.supplierId, name: selectedSupplierSummary.supplierName }
              : undefined
        }
        initialPayment={editingPayment ?? undefined}
        onSaved={fetchLedger}
      />

      <SupplierAdjustmentDialog
        open={adjDialogOpen}
        onOpenChange={(o) => { setAdjDialogOpen(o); if (!o) setEditingAdjustment(null); }}
        fixedSupplier={
          editingAdjustment
            ? undefined
            : selectedSupplierId && selectedSupplierSummary
              ? { id: selectedSupplierSummary.supplierId, name: selectedSupplierSummary.supplierName }
              : undefined
        }
        initialAdjustment={editingAdjustment ?? undefined}
        onSaved={fetchLedger}
      />

    </>
  );
}
