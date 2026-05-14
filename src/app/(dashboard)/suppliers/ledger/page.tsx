"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Plus, Search, SlidersHorizontal, Printer, FileEdit, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTheme } from "next-themes";
import {
  JmBadge,
  JmButton,
  JmCheckbox,
  JmDateRangePicker,
  JmScope,
  JmScrollArea,
  JmSegmentedControl,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";
import { cn } from "@/lib/utils";
import { SupplierPaymentDialog } from "@/components/supplier-payment-dialog";
import { SupplierAdjustmentDialog } from "@/components/supplier-adjustment-dialog";
import { type PaymentMethod } from "@/lib/validators/supplier";
import { startOfMonth, endOfMonth, format } from "date-fns";

import {
  ALL_TYPES,
  TYPE_JM_VARIANTS,
  TYPE_LABELS,
  type DatePreset,
  type LedgerEntry,
  type LedgerItem,
  type LedgerResponse,
  type LedgerType,
  type ViewMode,
} from "./_types";
import {
  applyDatePreset,
  buildItemDateGroups,
  formatAmount,
  getCurrentPresetLabel,
} from "./_helpers";
import { ItemsView } from "./_views";
import {
  SupplierLedgerTable,
  type SupplierLedgerEntry,
} from "@/components/supplier-ledger-table";

// URL ↔ state 헬퍼 — 새로고침/북마크 살리기 위함
function parseDateParam(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function fmtDateParam(d: Date | undefined): string | undefined {
  if (!d) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SupplierLedgerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  // 모바일/좁은 화면에서 좌측 패널 접기 토글 (기본: 펼침) — URL 비반영
  const [panelOpen, setPanelOpen] = useState(true);

  const now = useMemo(() => new Date(), []);

  // ─── URL → state 초기화 (mount 1회) ──────────────────────────────
  const initialView: ViewMode =
    searchParams.get("view") === "ledger" ? "ledger" : "items";
  const initialFrom =
    parseDateParam(searchParams.get("from")) ??
    (searchParams.has("from") ? undefined : startOfMonth(now));
  const initialTo =
    parseDateParam(searchParams.get("to")) ??
    (searchParams.has("to") ? undefined : endOfMonth(now));
  const initialSearch = searchParams.get("q") ?? "";
  const initialSupplierId = searchParams.get("supplier");
  const initialTypesParam = searchParams.get("types");
  const initialTypes: LedgerType[] = initialTypesParam
    ? (initialTypesParam
        .split(",")
        .filter((t) => (ALL_TYPES as readonly string[]).includes(t)) as LedgerType[])
    : [...ALL_TYPES];

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [from, setFrom] = useState<Date | undefined>(initialFrom);
  const [to, setTo] = useState<Date | undefined>(initialTo);

  const [search, setSearch] = useState(initialSearch);
  // 검색은 입력 즉시 UI 반영하되, 서버 fetch / URL 동기화는 300ms debounce
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [types, setTypes] = useState<LedgerType[]>(initialTypes);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    initialSupplierId,
  );
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);

  // ─── state → URL 동기화 (replace, debounce 된 search 사용) ──────
  // mount 시 첫 effect 는 skip — 초기화 단계에서 불필요한 history 생성 방지
  const didMountRef = React.useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const sp = new URLSearchParams();
    if (viewMode !== "items") sp.set("view", viewMode);
    if (selectedSupplierId) sp.set("supplier", selectedSupplierId);
    const f = fmtDateParam(from);
    const t = fmtDateParam(to);
    if (f) sp.set("from", f);
    if (t) sp.set("to", t);
    if (!from && !to) {
      // "전체 기간" 도 명시적으로 표시 (기본값과 구분)
      sp.set("from", "");
      sp.set("to", "");
    }
    if (debouncedSearch.trim()) sp.set("q", debouncedSearch.trim());
    if (types.length < ALL_TYPES.length) sp.set("types", types.join(","));
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [viewMode, selectedSupplierId, from, to, debouncedSearch, types, router]);

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

  const ledgerQuery = useQuery({
    queryKey: queryKeys.ledger.suppliers({
      from: from?.toISOString(),
      to: to?.toISOString(),
      types: types.join(","),
      search: debouncedSearch,
      selectedSupplierId,
      viewMode,
    }),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) {
        const toInclusive = new Date(to);
        toInclusive.setDate(toInclusive.getDate() + 1);
        params.set("to", toInclusive.toISOString());
      }
      if (types.length < ALL_TYPES.length) params.set("types", types.join(","));
      if (debouncedSearch && !selectedSupplierId) params.set("q", debouncedSearch);
      if (selectedSupplierId) params.set("supplierId", selectedSupplierId);

      const ledger = await apiGet<LedgerResponse>(`/api/suppliers/ledger?${params}`);

      let items: LedgerItem[] = [];
      let paymentsInItems: LedgerEntry[] = [];
      let purchasesInItems: LedgerEntry[] = [];

      if (viewMode === "items") {
        const payParams = new URLSearchParams();
        if (from) payParams.set("from", from.toISOString());
        if (to) {
          const toInc = new Date(to);
          toInc.setDate(toInc.getDate() + 1);
          payParams.set("to", toInc.toISOString());
        }
        if (selectedSupplierId) payParams.set("supplierId", selectedSupplierId);
        else if (debouncedSearch) payParams.set("q", debouncedSearch);
        payParams.set("types", "PAYMENT,ADJUSTMENT,REFUND");

        const purParams = new URLSearchParams(payParams);
        purParams.set("types", "PURCHASE");

        const [itemsPayload, paysPayload, pursPayload] = await Promise.all([
          apiGet<{ items: LedgerItem[] }>(`/api/suppliers/ledger/items?${params}`),
          apiGet<{ entries: LedgerEntry[] }>(`/api/suppliers/ledger?${payParams}`),
          apiGet<{ entries: LedgerEntry[] }>(`/api/suppliers/ledger?${purParams}`),
        ]);
        items = itemsPayload.items;
        paymentsInItems = paysPayload.entries;
        purchasesInItems = pursPayload.entries;
      }

      return { ledger, items, paymentsInItems, purchasesInItems };
    },
  });
  const data: LedgerResponse = ledgerQuery.data?.ledger ?? { entries: [], supplierSummaries: [] };
  const items: LedgerItem[] = ledgerQuery.data?.items ?? [];
  const paymentsInItems: LedgerEntry[] = ledgerQuery.data?.paymentsInItems ?? [];
  const purchasesInItems: LedgerEntry[] = ledgerQuery.data?.purchasesInItems ?? [];
  const loading = ledgerQuery.isPending;
  // ["ledger", "suppliers"] prefix 로 모든 파라미터 변형을 한 번에 무효화 (factory 와 동일 prefix)
  const fetchLedger = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.ledger.suppliers() });

  const applyPreset = (preset: DatePreset) => {
    const { from: nextFrom, to: nextTo } = applyDatePreset(preset, now);
    setFrom(nextFrom);
    setTo(nextTo);
  };

  const currentPresetLabel = getCurrentPresetLabel(from, to, now);

  // 좌측 패널은 즉시 필터링 (UX 반응성 — debounce 와 별개)
  const filteredSummaries = data.supplierSummaries.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return s.supplierName.toLowerCase().includes(q);
    }
    return true;
  });

  const onEntryDoubleClick = (e: LedgerEntry) => {
    if (e.type === "PAYMENT" && e.referenceType === "SUPPLIER_PAYMENT" && e.referenceId) {
      apiGet<{
        id: string;
        supplier: { id: string; name: string };
        amount: string;
        paymentDate: string;
        method: string;
        memo: string | null;
      }>(`/api/supplier-payments/${e.referenceId}`).then((p) => {
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

  // 빈 상태 분기 — (1) 거래처 미등록, (2) 검색 무결과, (3) 기간 내 무거래
  const isDataEmpty = data.supplierSummaries.length === 0;
  const isSearchEmpty =
    !!debouncedSearch.trim() && filteredSummaries.length === 0 && !isDataEmpty;

  const emptyStateHint = isDataEmpty ? (
    <div className="text-center py-10 text-[var(--jm-text-muted)] text-sm">
      <p>등록된 거래처가 없습니다</p>
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-1 mt-3 px-3 h-7 rounded-md border border-[var(--jm-border-strong)] bg-[var(--jm-surface-muted)] text-[var(--jm-text)] text-[11px] hover:bg-[var(--jm-surface-muted)]/80 transition-colors"
      >
        거래처 등록하러 가기
      </Link>
    </div>
  ) : isSearchEmpty ? (
    <div className="text-center py-10 text-[var(--jm-text-muted)] text-sm">
      <p>
        <span className="text-[var(--jm-text)] font-medium">
          &ldquo;{debouncedSearch}&rdquo;
        </span>{" "}
        에 해당하는 거래처가 없습니다
      </p>
      <button
        type="button"
        onClick={() => setSearch("")}
        className="mt-3 px-3 h-7 rounded-md border border-[var(--jm-border-strong)] bg-[var(--jm-surface-muted)] text-[var(--jm-text)] text-[11px] hover:bg-[var(--jm-surface-muted)]/80 transition-colors"
      >
        검색 지우기
      </button>
    </div>
  ) : (
    <div className="text-center py-8 text-[var(--jm-text-muted)] text-sm">
      거래 내역이 없습니다
      {hasHiddenHistory && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <p className="text-[11px] text-[var(--jm-text-muted)] max-w-[360px]">
            선택한 기간에 거래가 없습니다. 과거 거래를 보려면 기간을 넓혀보세요.
          </p>
          <button
            type="button"
            onClick={() => applyPreset("all")}
            className="px-3 h-7 rounded-md border border-[var(--jm-border-strong)] bg-[var(--jm-surface-muted)] text-[var(--jm-text)] text-[11px] hover:bg-[var(--jm-surface-muted)]/80 transition-colors"
          >
            전체 기간 보기
          </button>
        </div>
      )}
    </div>
  );

  // 날짜별 그룹핑 — 품목 뷰만 (원장 뷰는 SupplierLedgerTable 내부에서 빌드)
  const itemDateGroups = buildItemDateGroups(items, paymentsInItems, purchasesInItems);

  return (
    <JmScope theme={resolvedTheme === "dark" ? "dark" : "light"} className="contents">
      <div className="flex h-full">
        {/* ─── 좌측 패널 ─── */}
        {panelOpen && (
        <div className="w-[320px] max-md:w-[280px] shrink-0 border-r border-[var(--jm-border)] flex flex-col bg-[var(--jm-bg)]">
          {/* 헤더 */}
          <div className="h-10 px-3 border-b border-[var(--jm-border)] flex items-center shrink-0">
            <h2 className="text-sm font-medium">거래처 원장</h2>
          </div>

          {/* 등록 버튼들 */}
          <div className="px-3 pt-2 shrink-0 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <JmButton
                size="sm"
                onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                className="h-8 text-xs"
              >
                <Plus /><span>결제 등록</span>
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
            <div className="flex gap-1.5">
              <Link
                href="/suppliers/initial-balance"
                className="flex-1 h-7 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] hover:bg-[var(--jm-surface-muted)] text-[11px] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] flex items-center justify-center transition-colors"
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
                    ? "bg-[var(--jm-info-bg)] border-[var(--jm-info-fg)]/40 text-[var(--jm-info-fg)] hover:bg-[var(--jm-info-bg)]/80"
                    : "border-[var(--jm-border)] bg-[var(--jm-surface)] opacity-40 cursor-not-allowed text-[var(--jm-text-muted)]"
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

          {/* 뷰 전환 — SegmentedControl */}
          <div className="px-3 pt-2 shrink-0">
            <JmSegmentedControl
              size="sm"
              fullWidth
              ariaLabel="뷰 전환"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { value: "items", label: "품목별 뷰" },
                { value: "ledger", label: "원장 뷰" },
              ]}
            />
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
                      ? "bg-[var(--jm-info-bg)] border-[var(--jm-info-fg)]/40 text-[var(--jm-info-fg)]"
                      : "border-[var(--jm-border)] text-[var(--jm-text-muted)] hover:text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)]"
                  )}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          {/* 기간 선택 — JmDateRangePicker */}
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

          {/* 검색 + 유형 필터 */}
          <div className="px-3 pb-2 flex items-center gap-2 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 h-8 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] px-2.5">
              <Search className="size-3.5 text-[var(--jm-text-muted)] shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="거래처 검색..."
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

          {/* 거래처 목록 */}
          <JmScrollArea className="flex-1 min-h-0">
            <div
              onClick={() => setSelectedSupplierId(null)}
              className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedSupplierId === null ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">전체 거래</span>
                <span className="text-xs text-[var(--jm-text-muted)]">{data.entries.length}건</span>
              </div>
            </div>
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-[var(--jm-text-muted)] text-sm">
                {isDataEmpty
                  ? "거래처가 없습니다"
                  : `"${search}" 검색 결과 없음`}
              </div>
            ) : (
              filteredSummaries.map((s) => {
                const bal = s.currentBalance;
                // 정상 미지급(양수)·0 → 기본색. 과지급(음수, 비정상) → 빨강 강조
                const balColor = bal < 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text-muted)]";
                return (
                  <div
                    key={s.supplierId}
                    onClick={() => setSelectedSupplierId(s.supplierId)}
                    className={cn("px-3 py-2.5 border-b border-[var(--jm-border)] cursor-pointer transition-colors", selectedSupplierId === s.supplierId ? "bg-[var(--jm-surface-muted)]" : "hover:bg-[var(--jm-surface-muted)]/60")}
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
          </JmScrollArea>
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
            // 과지급(음수) 만 빨강. 정상 미지급(양수)·0 은 기본색
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
                {viewMode === "ledger" ? (
                  <>
                    <span>거래: <b className="text-[var(--jm-text)]">{data.entries.length}건</b></span>
                    <span>차변 합: <b className="text-[var(--jm-text)]">₩{formatAmount(totalDebit)}</b></span>
                    <span>대변 합: <b className="text-[var(--jm-text)]">₩{formatAmount(totalCredit)}</b></span>
                  </>
                ) : (
                  <>
                    <span>품목: <b className="text-[var(--jm-text)]">{items.length}건</b></span>
                    <span>결제: <b className="text-[var(--jm-text)]">{paymentsInItems.length}건</b></span>
                    <span>합계 합 (VAT 포함): <b className="text-[var(--jm-text)]">₩{formatAmount(items.reduce((s, i) => {
                      const supply = parseFloat(i.totalPrice);
                      return s + (i.supplierProduct.isTaxable ? Math.round(supply * 1.1) : supply);
                    }, 0))}</b></span>
                    <span>결제 합: <b className="text-[var(--jm-text)]">₩{formatAmount(paymentsInItems.reduce((s, p) => s + parseFloat(p.creditAmount), 0))}</b></span>
                  </>
                )}
                <span className="text-[var(--jm-text-muted)]/50">|</span>
                <span>잔금: <b className={cn("tabular-nums", balanceClass)}>₩{formatAmount(totalBalance)}</b></span>
              </div>
            );
          })()}

          {/* 선택된 거래처 요약 */}
          {selectedSupplierSummary && (
            <div className="border-b border-[var(--jm-border)] px-4 py-3 flex items-center flex-wrap gap-x-6 gap-y-3 shrink-0">
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">거래처</p>
                <p className="text-sm font-medium">{selectedSupplierSummary.supplierName}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">현재 잔액</p>
                <p className={cn("text-sm font-medium tabular-nums",
                  selectedSupplierSummary.currentBalance < 0 ? "text-[var(--jm-danger-fg)]" : "text-[var(--jm-text)]")}>
                  ₩{formatAmount(selectedSupplierSummary.currentBalance)}
                </p>
              </div>
              {from && (
                <div>
                  <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">이월 잔액</p>
                  <p className="text-sm tabular-nums text-[var(--jm-text)]">
                    ₩{formatAmount(selectedSupplierSummary.openingBalance)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">기간 매입</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedSupplierSummary.totalPurchase)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--jm-text-muted)] uppercase tracking-wide">기간 결제</p>
                <p className="text-sm tabular-nums">₩{formatAmount(selectedSupplierSummary.totalPayment)}</p>
              </div>
              <div>
                <JmButton size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setEditingPayment(null); setPayDialogOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />결제 등록
                </JmButton>
              </div>
            </div>
          )}

          {/* 테이블 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <JmTable className="min-w-[900px] table-fixed border-b border-[var(--jm-border)]">
                <colgroup>
                  {!selectedSupplierId && <col style={{ width: "14%" }} />}
                  <col style={{ width: "70px" }} />
                  <col />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "120px" }} />
                </colgroup>
                <JmTableHeader className="sticky top-0 z-10">
                  <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
                    {!selectedSupplierId && <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">거래처</JmTableHead>}
                    <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 text-center font-medium">유형</JmTableHead>
                    <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 font-medium">설명</JmTableHead>
                    <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 text-center font-medium">참조</JmTableHead>
                    <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 text-right font-medium">차변 (매입)</JmTableHead>
                    <JmTableHead className="border-r border-b border-[var(--jm-border)] h-auto py-1.5 px-2 text-right font-medium">대변 (결제)</JmTableHead>
                    <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-2 text-right font-medium">잔액</JmTableHead>
                  </JmTableRow>
                </JmTableHeader>
                <JmTableBody>
                  {Array.from({ length: 3 }).map((_, gi) => (
                    <React.Fragment key={`sk-group-${gi}`}>
                      <JmTableRow className="bg-[var(--jm-surface)] hover:bg-[var(--jm-surface)]">
                        <JmTableCell colSpan={selectedSupplierId ? 6 : 7} className="px-3 py-1.5">
                          <JmSkeleton className="h-3 w-24" />
                        </JmTableCell>
                      </JmTableRow>
                      {Array.from({ length: 3 }).map((_, ri) => (
                        <JmTableRow key={`sk-${gi}-${ri}`} className="hover:bg-transparent">
                          {!selectedSupplierId && (
                            <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-24" /></JmTableCell>
                          )}
                          <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-center">
                            <JmSkeleton className="h-5 w-12 rounded-md mx-auto" />
                          </JmTableCell>
                          <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-40" /></JmTableCell>
                          <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5"><JmSkeleton className="h-4 w-16 mx-auto" /></JmTableCell>
                          <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div>
                          </JmTableCell>
                          <JmTableCell className="border-r border-[var(--jm-border)] px-2 py-1.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-20" /></div>
                          </JmTableCell>
                          <JmTableCell className="px-2 py-1.5 text-right">
                            <div className="flex justify-end"><JmSkeleton className="h-4 w-24" /></div>
                          </JmTableCell>
                        </JmTableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </JmTableBody>
              </JmTable>
            ) : viewMode === "ledger" ? (
              <SupplierLedgerTable
                entries={data.entries as SupplierLedgerEntry[]}
                showSupplierColumn={!selectedSupplierId}
                opening={
                  from && selectedSupplierSummary
                    ? { from, amount: selectedSupplierSummary.openingBalance }
                    : undefined
                }
                onEntryDoubleClick={(e) =>
                  onEntryDoubleClick(e as unknown as Parameters<typeof onEntryDoubleClick>[0])
                }
                emptyState={emptyStateHint}
              />
            ) : (
              <ItemsView
                itemDateGroups={itemDateGroups}
                selectedSupplierId={selectedSupplierId}
                selectedSupplierSummary={selectedSupplierSummary}
                from={from}
                onEntryDoubleClick={onEntryDoubleClick}
                onIncomingDeepLink={(id) => router.push(`/inventory/incoming?incomingId=${id}`)}
                emptyState={emptyStateHint}
              />
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

    </JmScope>
  );
}
