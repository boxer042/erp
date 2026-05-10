"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
  JmComboboxModal,
  JmDateRangePicker,
  JmEmpty,
  JmIconButton,
  JmPill,
  JmSearchInput,
  JmSelect,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarActions,
  JmTableToolbarFilters,
  JmTableToolbarMore,
  JmTableToolbarSearch,
} from "@/jm";
import { Search, X } from "lucide-react";

import { OrderDetailSheet } from "../../orders/_detail-sheet";
import {
  ChannelBadge,
  ChannelDistribution,
  ClaimBadge,
  PaymentStatusBadge,
  SalesAmountCell,
  SalesStatusBadge,
  TableRowSkeleton,
  TypeBadge,
} from "./_parts";
import { formatKrw, presetToRange } from "./_helpers";
import {
  PAYMENT_METHOD_LABEL,
  RANGE_PRESETS,
  SORT_OPTIONS,
  STATUS_GROUP_LABEL,
  TYPE_LABEL,
  type ChannelOption,
  type CustomerOption,
  type RangePreset,
  type SalesHistoryResponse,
  type SalesSortKey,
  type SalesStatusGroup,
  type SalesType,
} from "./_types";

const TYPE_FILTER_OPTIONS: Array<{
  value: "ALL" | SalesType;
  label: string;
}> = [
  { value: "ALL", label: "전체 타입" },
  { value: "product", label: TYPE_LABEL.product },
  { value: "repair", label: TYPE_LABEL.repair },
  { value: "rental", label: TYPE_LABEL.rental },
];

const STATUS_GROUP_FILTERS: Array<{ value: SalesStatusGroup; label: string }> =
  [
    { value: "all", label: STATUS_GROUP_LABEL.all },
    { value: "in_progress", label: STATUS_GROUP_LABEL.in_progress },
    { value: "confirmed", label: STATUS_GROUP_LABEL.confirmed },
    { value: "claim", label: STATUS_GROUP_LABEL.claim },
    { value: "terminal", label: STATUS_GROUP_LABEL.terminal },
  ];

const PAYMENT_STATUS_OPTIONS = [
  { value: "ALL", label: "결제상태 전체" },
  { value: "PAID", label: "결제완료" },
  { value: "UNPAID", label: "외상" },
  { value: "REFUND_PENDING", label: "환불진행" },
  { value: "REFUNDED", label: "환불완료" },
  { value: "SALES_CANCELLED", label: "매출취소" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "ALL", label: "결제수단 전체" },
  { value: "CASH", label: "현금" },
  { value: "CARD", label: "카드" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "MIXED", label: "혼합" },
  { value: "UNPAID", label: "외상" },
];

export default function SalesHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailId = searchParams.get("id");

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [preset, setPreset] = useState<RangePreset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | SalesType>("ALL");
  const [statusGroup, setStatusGroup] = useState<SalesStatusGroup>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("ALL");
  const [paymentMethod, setPaymentMethod] = useState<string>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [customerId, setCustomerId] = useState<string>("");
  const [includeExchangeReplacement, setIncludeExchangeReplacement] =
    useState(false);
  const [sort, setSort] = useState<SalesSortKey>("date_desc");
  const [page, setPage] = useState(1);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  const range = useMemo(() => {
    if (preset === "CUSTOM") return { from: customFrom, to: customTo };
    if (preset === "ALL") return { from: "", to: "" };
    return presetToRange(preset);
  }, [preset, customFrom, customTo]);

  // CUSTOM 프리셋일 때 picker 에 넘길 DateRange (string ↔ Date 변환)
  const customRangeValue = useMemo(() => {
    if (!customFrom) return undefined;
    const fromDate = parse(customFrom, "yyyy-MM-dd", new Date());
    const toDate = customTo
      ? parse(customTo, "yyyy-MM-dd", new Date())
      : fromDate;
    return { from: fromDate, to: toDate };
  }, [customFrom, customTo]);

  // 필터 변경 시 페이지 리셋 — 렌더 중 비교 패턴 (effect 회피)
  const filterKey = `${range.from}|${range.to}|${typeFilter}|${statusGroup}|${paymentStatus}|${paymentMethod}|${channelFilter}|${customerId}|${includeExchangeReplacement}|${appliedSearch}|${sort}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const queryParams = useMemo(() => {
    const sp = new URLSearchParams();
    if (range.from) sp.set("from", range.from);
    if (range.to) sp.set("to", range.to);
    if (typeFilter !== "ALL") sp.set("type", typeFilter);
    if (statusGroup !== "all") sp.set("statusGroup", statusGroup);
    if (paymentStatus !== "ALL") sp.set("paymentStatus", paymentStatus);
    if (paymentMethod !== "ALL") sp.set("paymentMethod", paymentMethod);
    if (channelFilter !== "all") sp.set("channelFilter", channelFilter);
    if (customerId) sp.set("customerId", customerId);
    if (appliedSearch) sp.set("search", appliedSearch);
    if (includeExchangeReplacement) sp.set("includeExchangeReplacement", "1");
    sp.set("sort", sort);
    sp.set("page", String(page));
    sp.set("pageSize", "50");
    return sp.toString();
  }, [
    range.from,
    range.to,
    typeFilter,
    statusGroup,
    paymentStatus,
    paymentMethod,
    channelFilter,
    customerId,
    appliedSearch,
    includeExchangeReplacement,
    sort,
    page,
  ]);

  const dataQuery = useQuery<SalesHistoryResponse>({
    queryKey: queryKeys.sales.history({ q: queryParams }),
    queryFn: () => apiGet<SalesHistoryResponse>(`/api/sales/history?${queryParams}`),
    placeholderData: (prev) => prev,
  });

  // 채널 목록 (필터 옵션용)
  const channelsQuery = useQuery({
    queryKey: queryKeys.channels.list(),
    queryFn: () => apiGet<ChannelOption[]>("/api/channels"),
    staleTime: 1000 * 60 * 5,
  });

  // 고객 목록 (combobox 용)
  const customersQuery = useQuery({
    queryKey: ["customers-for-sales-filter"],
    queryFn: () => apiGet<CustomerOption[]>("/api/customers"),
    staleTime: 1000 * 60 * 5,
  });

  const customerItems = useMemo(
    () =>
      (customersQuery.data ?? []).map((c) => ({
        id: c.id,
        label: c.name,
        description: c.businessNumber ?? c.phone ?? undefined,
      })),
    [customersQuery.data],
  );

  const selectedCustomer = useMemo(
    () => (customersQuery.data ?? []).find((c) => c.id === customerId) ?? null,
    [customersQuery.data, customerId],
  );

  const channelOptions = useMemo(
    () => [
      { value: "all", label: "채널 전체" },
      { value: "offline", label: "오프라인" },
      ...(channelsQuery.data ?? []).map((c) => ({
        value: c.id,
        label: c.name,
      })),
    ],
    [channelsQuery.data],
  );

  const rows = dataQuery.data?.rows ?? [];
  const summary = dataQuery.data?.summary;
  const pagination = dataQuery.data?.pagination;

  const downloadCsv = () => {
    const sp = new URLSearchParams();
    if (range.from) sp.set("from", range.from);
    if (range.to) sp.set("to", range.to);
    if (typeFilter !== "ALL") sp.set("type", typeFilter);
    if (statusGroup !== "all") sp.set("statusGroup", statusGroup);
    if (paymentStatus !== "ALL") sp.set("paymentStatus", paymentStatus);
    if (paymentMethod !== "ALL") sp.set("paymentMethod", paymentMethod);
    if (channelFilter !== "all") sp.set("channelFilter", channelFilter);
    if (customerId) sp.set("customerId", customerId);
    if (appliedSearch) sp.set("search", appliedSearch);
    if (includeExchangeReplacement) sp.set("includeExchangeReplacement", "1");
    window.location.href = `/api/sales/history/export?${sp.toString()}`;
  };

  const openDetail = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("id", id);
    router.push(`/sales/history?${sp.toString()}`);
  };
  const closeDetail = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("id");
    const q = sp.toString();
    router.push(`/sales/history${q ? `?${q}` : ""}`);
  };

  const onRowClick = (row: SalesHistoryResponse["rows"][number]) => {
    if (row.isOrphan) {
      // orphan 은 Order 가 없으므로 도메인 페이지로 이동
      if (row.type === "repair") router.push(`/repairs/${row.sourceId}`);
      else if (row.type === "rental") router.push(`/rentals/${row.sourceId}`);
      return;
    }
    // Order 행 — 같은 페이지에서 detail sheet
    openDetail(row.sourceId);
  };

  // 활성 필터 카운트 (more 버튼 뱃지용)
  const moreFilterCount =
    (paymentStatus !== "ALL" ? 1 : 0) +
    (paymentMethod !== "ALL" ? 1 : 0) +
    (channelFilter !== "all" ? 1 : 0) +
    (customerId ? 1 : 0) +
    (includeExchangeReplacement ? 1 : 0);

  const isPending = dataQuery.isPending;
  const isError = dataQuery.isError;

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <JmStat
            label="총 거래액"
            value={isPending ? "—" : formatKrw(summary?.totalAmount ?? 0)}
            icon={<ShoppingBag className="size-4" />}
            hint={
              isPending
                ? ""
                : `${(summary?.totalCount ?? 0).toLocaleString("ko-KR")}건`
            }
            size="sm"
          />
          <JmStat
            label="순 매출"
            value={isPending ? "—" : formatKrw(summary?.netAmount ?? 0)}
            icon={<TrendingUp className="size-4" />}
            hint={isPending ? "" : "환불·취소 제외"}
            size="sm"
          />
          <JmStat
            label="미수 (외상)"
            value={isPending ? "—" : formatKrw(summary?.unpaidAmount ?? 0)}
            icon={<Coins className="size-4" />}
            hint={isPending ? "" : "결제완료 전"}
            positiveIsGood={false}
            size="sm"
          />
          <JmStat
            label="환불·취소"
            value={isPending ? "—" : formatKrw(summary?.refundedAmount ?? 0)}
            icon={<RotateCcw className="size-4" />}
            hint={isPending ? "" : "환불완료 + 매출취소"}
            positiveIsGood={false}
            size="sm"
          />
          <JmStat
            label="진행중 클레임"
            value={isPending ? "—" : (summary?.claimInProgressCount ?? 0)}
            icon={<AlertCircle className="size-4" />}
            hint={isPending ? "" : "회수·검수 진행"}
            positiveIsGood={false}
            size="sm"
          />
        </div>

        {/* 메인 카드 */}
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onClear={() => {
                  setSearchInput("");
                  setAppliedSearch("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    setAppliedSearch(searchInput);
                  }
                }}
                placeholder="번호·고객명·전화·채널주문번호"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              {/* 기간 프리셋 */}
              <div className="flex h-8 items-center gap-1 rounded-lg bg-[var(--jm-surface-muted)] px-1">
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPreset(p.value)}
                    className={`rounded-md px-2 py-0.5 text-[12px] font-medium transition-colors ${
                      preset === p.value
                        ? "bg-[var(--jm-surface)] text-[var(--jm-text)] shadow-sm"
                        : "text-[var(--jm-text-muted)] hover:text-[var(--jm-text)]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {preset === "CUSTOM" && (
                <JmDateRangePicker
                  size="sm"
                  value={customRangeValue}
                  onChange={(r) => {
                    if (!r?.from) {
                      setCustomFrom("");
                      setCustomTo("");
                      return;
                    }
                    setCustomFrom(format(r.from, "yyyy-MM-dd"));
                    setCustomTo(format(r.to ?? r.from, "yyyy-MM-dd"));
                  }}
                  placeholder="기간 선택"
                  className="w-[260px]"
                />
              )}

              {/* 타입 pill — count 배지 포함 */}
              {TYPE_FILTER_OPTIONS.map((opt) => {
                const count =
                  opt.value === "ALL"
                    ? summary?.totalCount
                    : summary?.byType[opt.value].count;
                return (
                  <JmPill
                    key={opt.value}
                    size="sm"
                    active={typeFilter === opt.value}
                    onClick={() => setTypeFilter(opt.value)}
                  >
                    {opt.label}
                    {typeof count === "number" && count > 0 && (
                      <span className="ml-1 tabular-nums">{count}</span>
                    )}
                  </JmPill>
                );
              })}

              {/* 출고 상태 그룹 */}
              <span className="mx-1 h-5 w-px bg-[var(--jm-border)]" />
              {STATUS_GROUP_FILTERS.map((opt) => (
                <JmPill
                  key={opt.value}
                  size="sm"
                  active={statusGroup === opt.value}
                  onClick={() => setStatusGroup(opt.value)}
                >
                  {opt.label}
                </JmPill>
              ))}

              <JmTableToolbarMore
                count={moreFilterCount}
                onReset={() => {
                  setPaymentStatus("ALL");
                  setPaymentMethod("ALL");
                  setChannelFilter("all");
                  setCustomerId("");
                  setIncludeExchangeReplacement(false);
                }}
              >
                <JmSelect
                  size="sm"
                  value={paymentStatus}
                  onChange={(v) => setPaymentStatus(v)}
                  options={PAYMENT_STATUS_OPTIONS}
                  className="w-[150px]"
                />
                <JmSelect
                  size="sm"
                  value={paymentMethod}
                  onChange={(v) => setPaymentMethod(v)}
                  options={PAYMENT_METHOD_OPTIONS}
                  className="w-[140px]"
                />
                <JmSelect
                  size="sm"
                  value={channelFilter}
                  onChange={(v) => setChannelFilter(v)}
                  options={channelOptions}
                  className="w-[140px]"
                />
                {/* 고객 — 풀스크린 모달 트리거 */}
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(true)}
                  className="relative flex h-9 w-[200px] items-center justify-between rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 text-left text-[13px] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
                >
                  <span
                    className={`truncate ${
                      selectedCustomer
                        ? "text-[var(--jm-text)]"
                        : "text-[var(--jm-text-subtle)]"
                    }`}
                  >
                    {selectedCustomer?.name ?? "고객 전체"}
                  </span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 text-[var(--jm-text-muted)]">
                    {selectedCustomer && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerId("");
                        }}
                        className="flex size-5 items-center justify-center rounded-full hover:bg-[var(--jm-surface-muted)]"
                        aria-label="선택 해제"
                      >
                        <X className="size-3" />
                      </span>
                    )}
                    <Search className="size-3.5" />
                  </span>
                </button>
                <label className="flex items-center gap-1.5 text-[12px] text-[var(--jm-text)] whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeExchangeReplacement}
                    onChange={(e) =>
                      setIncludeExchangeReplacement(e.target.checked)
                    }
                    className="size-3.5 rounded border-[var(--jm-border)]"
                  />
                  교환 -EX 포함
                </label>
              </JmTableToolbarMore>
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmSelect
                size="sm"
                value={sort}
                onChange={(v) => setSort(v as SalesSortKey)}
                options={SORT_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                className="w-[130px]"
              />
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={() => dataQuery.refetch()}
                disabled={dataQuery.isFetching}
              >
                {dataQuery.isFetching ? (
                  <JmSpinner size="sm" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </JmIconButton>
              <JmButton
                variant="outline"
                size="sm"
                onClick={downloadCsv}
                disabled={isPending}
              >
                <Download className="size-4" />
                CSV
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          {/* 채널 분포 한 줄 */}
          {summary && summary.byChannel.length > 0 && (
            <ChannelDistribution
              channels={summary.byChannel}
              totalNet={summary.netAmount}
              activeChannelFilter={channelFilter}
              onSelect={(filter) => setChannelFilter(filter)}
            />
          )}

          {summary?.truncated && (
            <div className="border-b border-[var(--jm-warning-border)] bg-[var(--jm-warning-bg)] px-4 py-2 text-[12px] text-[var(--jm-warning-fg)]">
              결과가 5,000건을 넘었습니다. 기간을 더 좁혀주세요 (CSV 는 10,000건까지 받을 수 있습니다).
            </div>
          )}

          <div className="overflow-x-auto">
            <JmTable className="min-w-[1400px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[120px]">일시</JmTableHead>
                  <JmTableHead className="w-[60px]">타입</JmTableHead>
                  <JmTableHead className="w-[160px]">번호</JmTableHead>
                  <JmTableHead className="w-[120px]">출고</JmTableHead>
                  <JmTableHead className="w-[110px]">결제</JmTableHead>
                  <JmTableHead className="w-[140px]">클레임</JmTableHead>
                  <JmTableHead className="w-[120px]">채널</JmTableHead>
                  <JmTableHead>고객</JmTableHead>
                  <JmTableHead className="w-[90px]">결제수단</JmTableHead>
                  <JmTableHead className="w-[120px] text-right">금액</JmTableHead>
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={10} />
                  ))
                ) : isError ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={10}
                      className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                    >
                      판매내역을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : rows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={10} className="py-12">
                      <JmEmpty
                        icon={<ShoppingBag className="size-8" />}
                        title="해당 기간 판매내역이 없습니다"
                        description="기간을 늘리거나 필터를 초기화해보세요"
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  rows.map((row) => {
                    const refunded =
                      row.status === "RETURNED" ||
                      row.paymentStatus === "REFUNDED" ||
                      row.paymentStatus === "SALES_CANCELLED";
                    return (
                      <JmTableRow
                        key={row.id}
                        className={`cursor-pointer ${
                          refunded
                            ? "bg-[var(--jm-surface-muted)]/40 text-[var(--jm-text-muted)]"
                            : ""
                        }`}
                        onClick={() => onRowClick(row)}
                      >
                        <JmTableCell className="font-mono text-[12px] text-[var(--jm-text-muted)]">
                          {format(new Date(row.date), "MM-dd HH:mm")}
                        </JmTableCell>
                        <JmTableCell>
                          <TypeBadge type={row.type} />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex flex-col gap-0">
                            <span
                              className="block truncate font-mono text-[13px] font-medium text-[var(--jm-text)]"
                              title={row.refNo}
                            >
                              {row.refNo}
                            </span>
                            {row.channelOrderNo && (
                              <span
                                className="block truncate font-mono text-[10px] text-[var(--jm-text-subtle)]"
                                title={row.channelOrderNo}
                              >
                                {row.channelOrderNo}
                              </span>
                            )}
                          </div>
                        </JmTableCell>
                        <JmTableCell>
                          <SalesStatusBadge row={row} />
                        </JmTableCell>
                        <JmTableCell>
                          <PaymentStatusBadge
                            status={row.paymentStatus}
                            showPaid
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <ClaimBadge
                            claimType={row.claimType}
                            claimReason={row.claimReason}
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <ChannelBadge
                            channel={
                              row.channelId
                                ? {
                                    name: row.channelName ?? "",
                                    code: "",
                                  }
                                : null
                            }
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex flex-col">
                            <span className="text-[13px] text-[var(--jm-text)]">
                              {row.customerName ?? (
                                <span className="text-[var(--jm-text-subtle)]">
                                  (미등록)
                                </span>
                              )}
                            </span>
                            {row.customerPhone && (
                              <span className="font-mono text-[11px] text-[var(--jm-text-muted)]">
                                {row.customerPhone}
                              </span>
                            )}
                          </div>
                        </JmTableCell>
                        <JmTableCell className="text-[12px] text-[var(--jm-text-muted)]">
                          {row.paymentMethod
                            ? PAYMENT_METHOD_LABEL[row.paymentMethod] ??
                              row.paymentMethod
                            : "—"}
                        </JmTableCell>
                        <JmTableCell className="text-right">
                          <SalesAmountCell row={row} />
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })
                )}
              </JmTableBody>
            </JmTable>
          </div>

          {/* 페이지네이션 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--jm-border)] px-4 py-2.5">
              <span className="text-[12px] text-[var(--jm-text-muted)]">
                총 {pagination.totalCount.toLocaleString("ko-KR")}건 ·{" "}
                {pagination.page} / {pagination.totalPages} 페이지
              </span>
              <div className="flex items-center gap-1">
                <JmButton
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1 || dataQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3.5" />
                  이전
                </JmButton>
                <JmButton
                  variant="outline"
                  size="sm"
                  disabled={
                    pagination.page >= pagination.totalPages ||
                    dataQuery.isFetching
                  }
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                >
                  다음
                  <ChevronRight className="size-3.5" />
                </JmButton>
              </div>
            </div>
          )}
        </JmCard>
      </div>

      <OrderDetailSheet
        orderId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && closeDetail()}
      />

      <JmComboboxModal<(typeof customerItems)[number]>
        open={customerModalOpen}
        onOpenChange={setCustomerModalOpen}
        title="고객 검색"
        placeholder="이름·전화·사업자번호"
        items={customerItems}
        loading={customersQuery.isPending}
        getKey={(c) => c.id}
        filterFn={(c, q) => {
          const lo = q.toLowerCase();
          return (
            c.label.toLowerCase().includes(lo) ||
            (c.description?.toLowerCase().includes(lo) ?? false)
          );
        }}
        renderItem={(c) => (
          <>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)]">
              <Search className="size-5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-1 text-[15px] font-semibold text-[var(--jm-text)]">
                {c.label}
              </span>
              {c.description && (
                <span className="text-[12px] text-[var(--jm-text-muted)]">
                  {c.description}
                </span>
              )}
            </div>
          </>
        )}
        onSelect={(c) => setCustomerId(c.id)}
        emptyText="검색 결과 없음 — 고객 페이지에서 등록 후 다시 시도"
      />
    </div>
  );
}
