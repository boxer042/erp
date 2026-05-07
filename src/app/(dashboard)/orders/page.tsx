"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Plus,
  RefreshCw,
  Truck,
} from "lucide-react";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
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
  JmTableToolbarSearch,
} from "@/jm";

import { OrderCreateSheet } from "./_create-sheet";
import { OrderDetailSheet } from "./_detail-sheet";
import {
  AmountCell,
  ChannelBadge,
  FulfillmentBadge,
  PaymentStatusBadge,
  ShipDateCell,
  StatusBadge,
  StatusFlowGuide,
  TableRowSkeleton,
} from "./_parts";
import {
  type BoardGroupKey,
  type BoardResponse,
  type ChannelFilter,
  type OrderListItem,
  nextActionFor,
} from "./_types";
import { daysUntilShip, summarizeItems } from "./_helpers";

/** 그룹 필터 — KPI 카드 클릭 / pill 토글 */
type GroupFilter = "all" | BoardGroupKey;

const GROUP_LABELS: Record<GroupFilter, string> = {
  all: "전체",
  overdue: "지연",
  today: "오늘",
  unscheduled: "예정일 미정",
  shipped: "발송 중",
  thisWeek: "이번 주",
  future: "이후",
};

export default function OrdersBoardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const detailId = searchParams.get("id");

  const boardQuery = useQuery({
    queryKey: queryKeys.orders.board({
      search: appliedSearch,
      channelFilter,
    }),
    queryFn: () => {
      const params = new URLSearchParams({ view: "board" });
      if (appliedSearch) params.set("search", appliedSearch);
      if (channelFilter !== "all") params.set("channelFilter", channelFilter);
      return apiGet<BoardResponse>(`/api/orders?${params}`);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });

  const transitionMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "prepare" | "ship" | "complete" | "cancel" | "return";
    }) => apiMutate(`/api/orders/${id}`, "PUT", { action }),
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        prepare: "준비 시작 — 재고가 차감되었습니다",
        ship: "발송 처리되었습니다",
        complete: "주문이 완료되었습니다",
        cancel: "주문이 취소되었습니다",
        return: "반품 처리되었습니다",
      };
      toast.success(labels[vars.action]);
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "처리에 실패했습니다",
      ),
  });

  const today = boardQuery.data ? new Date(boardQuery.data.today) : new Date();

  const openDetail = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("id", id);
    router.push(`/orders?${sp.toString()}`);
  };
  const closeDetail = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("id");
    const q = sp.toString();
    router.push(`/orders${q ? `?${q}` : ""}`);
  };

  /** 그룹별 카운트 + 그룹 필터 적용한 행 */
  const { counts, rows } = useMemo(() => {
    const empty: Record<BoardGroupKey, OrderListItem[]> = {
      overdue: [],
      today: [],
      unscheduled: [],
      shipped: [],
      thisWeek: [],
      future: [],
    };
    const groups = boardQuery.data?.groups ?? empty;
    const counts: Record<GroupFilter, number> = {
      all: 0,
      overdue: groups.overdue.length,
      today: groups.today.length,
      unscheduled: groups.unscheduled.length,
      shipped: groups.shipped.length,
      thisWeek: groups.thisWeek.length,
      future: groups.future.length,
    };
    counts.all =
      counts.overdue +
      counts.today +
      counts.unscheduled +
      counts.shipped +
      counts.thisWeek +
      counts.future;

    // 그룹 필터 적용 — 정렬 우선순위는 지연 → 오늘 → 미정 → 발송 중 → 이번 주 → 이후
    const order: BoardGroupKey[] = [
      "overdue",
      "today",
      "unscheduled",
      "shipped",
      "thisWeek",
      "future",
    ];
    const all = order.flatMap((k) =>
      groups[k].map((o) => ({ ...o, _group: k })),
    );
    const filtered =
      groupFilter === "all"
        ? all
        : all.filter((r) => r._group === groupFilter);
    return { counts, rows: filtered };
  }, [boardQuery.data, groupFilter]);

  const isPending = boardQuery.isPending;
  const isError = boardQuery.isError;

  /** 채널 필터 옵션 — "전체 / 오프라인 / 활성 채널들" */
  const channelOptions = useMemo(() => {
    const base: { value: ChannelFilter; label: string }[] = [
      { value: "all", label: "전체 채널" },
      { value: "offline", label: "오프라인 (POS·수동)" },
    ];
    for (const c of boardQuery.data?.channels ?? []) {
      base.push({ value: c.id, label: c.name });
    }
    return base;
  }, [boardQuery.data?.channels]);

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="flex w-full flex-col gap-6 p-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <JmStat
            label="지연"
            value={isPending ? "—" : counts.overdue}
            icon={<AlertCircle className="size-4" />}
            hint={isPending ? "" : `${counts.overdue}건 즉시 처리`}
            positiveIsGood={false}
            size="sm"
          />
          <JmStat
            label="오늘 출고"
            value={isPending ? "—" : counts.today}
            icon={<Truck className="size-4" />}
            hint={isPending ? "" : "오늘 안에 발송"}
            size="sm"
          />
          <JmStat
            label="발송 중"
            value={isPending ? "—" : counts.shipped}
            icon={<CalendarClock className="size-4" />}
            hint={isPending ? "" : "인도 대기"}
            size="sm"
          />
          <JmStat
            label="예정일 미정"
            value={isPending ? "—" : counts.unscheduled}
            icon={<CalendarRange className="size-4" />}
            hint={isPending ? "" : "예정일 채워주세요"}
            positiveIsGood={false}
            size="sm"
          />
        </div>

        {/* 메인 카드 — 툴바 + 테이블 */}
        <JmCard className="overflow-hidden p-0">
          <JmTableToolbar>
            <JmTableToolbarSearch>
              <JmSearchInput
                size="sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => {
                  setSearch("");
                  setAppliedSearch("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    setAppliedSearch(search);
                  }
                }}
                placeholder="주문번호·고객명·채널주문번호"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              {(Object.keys(GROUP_LABELS) as GroupFilter[]).map((g) => (
                <JmPill
                  key={g}
                  size="sm"
                  active={groupFilter === g}
                  onClick={() => setGroupFilter(g)}
                >
                  {GROUP_LABELS[g]}
                  {g !== "all" && counts[g] > 0 && (
                    <span className="ml-1 tabular-nums">{counts[g]}</span>
                  )}
                </JmPill>
              ))}
              <JmSelect
                size="sm"
                value={channelFilter}
                onChange={(v) => setChannelFilter(v as ChannelFilter)}
                options={channelOptions}
                className="w-[180px]"
              />
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmIconButton
                variant="ghost"
                size="sm"
                aria-label="새로고침"
                onClick={() => boardQuery.refetch()}
                disabled={boardQuery.isFetching}
              >
                {boardQuery.isFetching ? (
                  <JmSpinner size="sm" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </JmIconButton>
              <JmButton size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                신규 주문
              </JmButton>
            </JmTableToolbarActions>
          </JmTableToolbar>

          {/* 상태 흐름 안내 — 각 상태가 무엇을 의미하고 다음에 무엇을 유도하는지 */}
          <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)]">
            <StatusFlowGuide />
          </div>

          <div className="overflow-x-auto">
            <JmTable className="min-w-[1200px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[140px]">주문번호</JmTableHead>
                  <JmTableHead className="w-[100px]">상태</JmTableHead>
                  <JmTableHead className="w-[110px]">출고</JmTableHead>
                  <JmTableHead className="w-[140px]">채널</JmTableHead>
                  <JmTableHead>고객 / 항목</JmTableHead>
                  <JmTableHead className="w-[110px]">출고예정</JmTableHead>
                  <JmTableHead className="w-[100px] text-right">합계</JmTableHead>
                  <JmTableHead className="w-[100px]">결제</JmTableHead>
                  <JmTableHead className="w-[120px]" />
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={9} />
                  ))
                ) : isError ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={9}
                      className="py-10 text-center text-[13px] text-[var(--jm-danger-fg)]"
                    >
                      주문 목록을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : rows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={9} className="py-12">
                      <JmEmpty
                        icon={<Truck className="size-8" />}
                        title={
                          groupFilter === "all"
                            ? "출고할 주문이 없습니다"
                            : `${GROUP_LABELS[groupFilter]} 주문 없음`
                        }
                        description={
                          groupFilter === "all"
                            ? "POS 결제(배송) 또는 외부 채널 주문이 들어오면 자동으로 워크보드에 진입합니다"
                            : "다른 필터를 선택하거나 새 주문을 등록해보세요"
                        }
                      />
                    </JmTableCell>
                  </JmTableRow>
                ) : (
                  rows.map((order) => {
                    const days = daysUntilShip(order.expectedShipDate, today);
                    const next = nextActionFor(order.status);
                    const rowPending =
                      transitionMutation.isPending &&
                      transitionMutation.variables?.id === order.id;
                    return (
                      <JmTableRow
                        key={order.id}
                        className="cursor-pointer"
                        onClick={() => openDetail(order.id)}
                      >
                        <JmTableCell>
                          <span className="font-mono text-[13px] font-medium text-[var(--jm-text)]">
                            {order.orderNo}
                          </span>
                          {order.channelOrderNo && (
                            <span className="block font-mono text-[10px] text-[var(--jm-text-subtle)]">
                              {order.channelOrderNo}
                            </span>
                          )}
                        </JmTableCell>
                        <JmTableCell>
                          <StatusBadge status={order.status} />
                        </JmTableCell>
                        <JmTableCell>
                          <FulfillmentBadge type={order.fulfillmentType} />
                        </JmTableCell>
                        <JmTableCell>
                          <ChannelBadge channel={order.channel} />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex flex-col">
                            <span className="text-[13px] text-[var(--jm-text)]">
                              {order.customerName ?? "—"}
                            </span>
                            <span className="line-clamp-1 text-[11px] text-[var(--jm-text-muted)]">
                              {summarizeItems(order)}
                            </span>
                          </div>
                        </JmTableCell>
                        <JmTableCell>
                          <ShipDateCell
                            expectedShipDate={order.expectedShipDate}
                            daysUntil={days}
                          />
                        </JmTableCell>
                        <JmTableCell className="text-right">
                          <AmountCell
                            totalAmount={order.totalAmount}
                            paymentStatus={order.paymentStatus}
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <PaymentStatusBadge
                            status={order.paymentStatus}
                            showPaid
                          />
                        </JmTableCell>
                        <JmTableCell>
                          <div className="flex items-center justify-end gap-1">
                            {next && (
                              <JmButton
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  transitionMutation.mutate({
                                    id: order.id,
                                    action: next.action,
                                  });
                                }}
                                disabled={rowPending}
                              >
                                {rowPending ? (
                                  <JmSpinner size="xs" tone="inverted" />
                                ) : null}
                                {next.label}
                              </JmButton>
                            )}
                            <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                          </div>
                        </JmTableCell>
                      </JmTableRow>
                    );
                  })
                )}
              </JmTableBody>
            </JmTable>
          </div>
        </JmCard>
      </div>

      <OrderCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidate}
      />

      <OrderDetailSheet
        orderId={detailId}
        open={!!detailId}
        onOpenChange={(o) => !o && closeDetail()}
      />
    </div>
  );
}
