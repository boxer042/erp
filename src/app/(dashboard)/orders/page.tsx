"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Plus,
  RefreshCw,
  RotateCcw,
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
  JmTableToolbarMore,
  JmTableToolbarSearch,
} from "@/jm";

import { OrderCreateSheet } from "./_create-sheet";
import { OrderDetailSheet } from "./_detail-sheet";
import { VariantResolveDialog } from "./_variant-resolve-dialog";
import {
  ChannelBadge,
  FulfillmentBadge,
  ItemPhaseBadge,
  PartialProgress,
  PaymentStatusBadge,
  ShipDateCell,
  ShippingPaymentBadge,
  StatusFlowGuide,
  TableRowSkeleton,
} from "./_parts";
import {
  deriveItemPhase,
  type BoardGroupKey,
  type BoardResponse,
  type ChannelFilter,
  type OrderItemRow,
  type OrderListItem,
  nextActionFor,
} from "./_types";
import { daysUntilShip } from "./_helpers";

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
  returnPending: "반품 처리",
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
  const detailItemId = searchParams.get("itemId");

  /**
   * prepare 가드 에러로 인한 변형/옵션 일괄 해결 다이얼로그.
   * API 가 400 + unresolvedItemIds 응답하면 그걸 받아 다이얼로그 열고,
   * resolve 완료 시 자동으로 prepare 재시도.
   */
  const [resolveContext, setResolveContext] = useState<{
    orderId: string;
    items: Array<{
      itemId: string;
      productId: string;
      productName: string;
      kind: "canonical" | "option_parent";
    }>;
  } | null>(null);

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
      action:
        | "prepare"
        | "pack"
        | "ship"
        | "complete"
        | "cancel"
        | "return"
        | "refund"
        | "exchange"
        | "accept_return"
        | "start_picking"
        | "collect_return"
        | "inspect_return"
        | "reject_inspection";
    }) => apiMutate(`/api/orders/${id}`, "PUT", { action }),
    onSuccess: (_data, vars) => {
      const labels: Record<string, string> = {
        prepare: "출고대기 — 재고 차감",
        pack: "출고확정 — 송장 발급 후 발송",
        ship: "배송 시작",
        complete: "배송 완료",
        cancel: "주문 취소 — 재고·결제 복원",
        return: "반품 종결",
        refund: "반품완료 — 환불 처리",
        exchange: "교환완료 — 새 주문 생성",
        accept_return: "수락 — 회수 대기",
        collect_return: "회수완료 — 검수 진행",
        inspect_return: "검수완료 — 환불/교환 종결 대기",
        reject_inspection: "검수 반려 — 손님 반송, 배송완료로 복귀",
      };
      toast.success(labels[vars.action]);
      invalidate();
    },
    onError: (err, vars) => {
      // prepare 가드 에러 (canonical/OPTION_PARENT 미확정) — 다이얼로그로 일괄 해결 진입
      if (vars.action === "prepare" && err instanceof ApiError) {
        const details = err.details as
          | { unresolvedItemIds?: unknown }
          | null;
        const ids = Array.isArray(details?.unresolvedItemIds)
          ? (details.unresolvedItemIds as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : [];
        if (ids.length > 0) {
          const groups = boardQuery.data?.groups;
          let order: OrderListItem | undefined;
          if (groups) {
            for (const g of Object.values(groups) as OrderListItem[][]) {
              order = g.find((o) => o.id === vars.id);
              if (order) break;
            }
          }
          const items = order
            ? order.items
                .filter(
                  (it) =>
                    ids.includes(it.id) &&
                    it.product &&
                    (it.product.isCanonical ||
                      it.product.productType === "OPTION_PARENT"),
                )
                .map((it) => ({
                  itemId: it.id,
                  productId: it.product!.id,
                  productName: it.product!.name,
                  kind:
                    it.product!.productType === "OPTION_PARENT"
                      ? ("option_parent" as const)
                      : ("canonical" as const),
                }))
            : [];
          if (items.length > 0) {
            setResolveContext({ orderId: vars.id, items });
            return;
          }
        }
      }
      toast.error(
        err instanceof ApiError ? err.message : "처리에 실패했습니다",
      );
    },
  });

  const today = boardQuery.data ? new Date(boardQuery.data.today) : new Date();

  const openDetail = (id: string, itemId?: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("id", id);
    if (itemId) sp.set("itemId", itemId);
    else sp.delete("itemId");
    router.push(`/orders?${sp.toString()}`);
  };
  const closeDetail = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("id");
    sp.delete("itemId");
    const q = sp.toString();
    router.push(`/orders${q ? `?${q}` : ""}`);
  };

  /** KPI 카운트는 order 단위, rows 는 OrderItemRow 평탄화 + 그룹 메타 */
  const { counts, rows } = useMemo(() => {
    const empty: Record<BoardGroupKey, OrderListItem[]> = {
      overdue: [],
      today: [],
      unscheduled: [],
      shipped: [],
      thisWeek: [],
      future: [],
      returnPending: [],
    };
    const groups = boardQuery.data?.groups ?? empty;
    // KPI 카운트 — 주문 단위 유지 (행이 늘어났다고 카운트 부풀리지 않음)
    const counts: Record<GroupFilter, number> = {
      all: 0,
      overdue: groups.overdue.length,
      today: groups.today.length,
      unscheduled: groups.unscheduled.length,
      shipped: groups.shipped.length,
      thisWeek: groups.thisWeek.length,
      future: groups.future.length,
      returnPending: groups.returnPending.length,
    };
    counts.all =
      counts.overdue +
      counts.today +
      counts.unscheduled +
      counts.shipped +
      counts.thisWeek +
      counts.future +
      counts.returnPending;

    const order: BoardGroupKey[] = [
      "returnPending",
      "overdue",
      "today",
      "unscheduled",
      "shipped",
      "thisWeek",
      "future",
    ];
    const orders = order.flatMap((k) =>
      groups[k].map((o) => ({ ...o, _group: k })),
    );
    const filteredOrders =
      groupFilter === "all"
        ? orders
        : orders.filter((o) => o._group === groupFilter);

    // OrderItemRow 평탄화 — 같은 order 의 items 는 인접 배치, 그룹 메타 부착
    const itemRows: OrderItemRow[] = [];
    for (const o of filteredOrders) {
      const groupSize = o.items.length;
      if (groupSize === 0) continue;
      o.items.forEach((it, idx) => {
        itemRows.push({
          rowKey: `${o.id}:${it.id}`,
          order: o,
          item: it,
          isFirstInGroup: idx === 0,
          groupSize,
          groupIndex: idx,
        });
      });
    }
    return { counts, rows: itemRows };
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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
          <JmStat
            label="반품 처리"
            value={isPending ? "—" : counts.returnPending}
            icon={<RotateCcw className="size-4" />}
            hint={isPending ? "" : "수락·회수 대기"}
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
              <JmTableToolbarMore
                count={
                  (groupFilter !== "all" ? 1 : 0) +
                  (channelFilter !== "all" ? 1 : 0)
                }
                onReset={() => {
                  setGroupFilter("all");
                  setChannelFilter("all");
                }}
              >
                <JmSelect
                  size="sm"
                  value={channelFilter}
                  onChange={(v) => setChannelFilter(v as ChannelFilter)}
                  options={channelOptions}
                  className="w-[180px]"
                />
              </JmTableToolbarMore>
            </JmTableToolbarFilters>
            <JmTableToolbarActions>
              <JmButton
                variant="ghost"
                size="sm"
                onClick={() => router.push("/orders/help")}
              >
                <BookOpen className="size-4" />
                도움말
              </JmButton>
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
            <JmTable className="min-w-[1320px]">
              <JmTableHeader>
                <JmTableRow>
                  <JmTableHead className="w-[140px]">주문번호</JmTableHead>
                  <JmTableHead className="w-[100px]">채널</JmTableHead>
                  <JmTableHead className="w-[80px]">출고</JmTableHead>
                  <JmTableHead className="w-[110px]">고객</JmTableHead>
                  <JmTableHead>품목</JmTableHead>
                  <JmTableHead className="w-[120px]">수량</JmTableHead>
                  <JmTableHead className="w-[110px] text-right">금액</JmTableHead>
                  <JmTableHead className="w-[80px]">배송비</JmTableHead>
                  <JmTableHead className="w-[90px]">결제</JmTableHead>
                  <JmTableHead className="w-[110px]">상태</JmTableHead>
                  <JmTableHead className="w-[100px]">출고예정</JmTableHead>
                  <JmTableHead className="w-[110px]" />
                </JmTableRow>
              </JmTableHeader>
              <JmTableBody>
                {isPending ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={12} />
                  ))
                ) : isError ? (
                  <JmTableRow>
                    <JmTableCell
                      colSpan={12}
                      className="py-10 text-center text-jm-sm text-[var(--jm-danger-fg)]"
                    >
                      주문 목록을 불러오지 못했습니다
                    </JmTableCell>
                  </JmTableRow>
                ) : rows.length === 0 ? (
                  <JmTableRow className="hover:bg-transparent">
                    <JmTableCell colSpan={12} className="py-12">
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
                  rows.map((row) => {
                    const { order, item, isFirstInGroup, groupSize } = row;
                    const days = daysUntilShip(order.expectedShipDate, today);
                    const next = isFirstInGroup
                      ? nextActionFor(order.status, order.claimType)
                      : null;
                    const rowPending =
                      transitionMutation.isPending &&
                      transitionMutation.variables?.id === order.id;
                    const phase = deriveItemPhase(
                      order.status,
                      Number(item.quantity),
                      Number(item.shippedQty),
                      Number(item.returnedQty),
                    );

                    // 그룹 시각 — 자식 행은 상단 보더 제거 (테이블 기본 row 보더가 안 그려지도록)
                    // + 첫 셀 좌측 padding 만 살짝 추가해 들여쓰기 표현. 굵은 보더 X.
                    const childRowClass = !isFirstInGroup
                      ? "[&>td]:border-t-0"
                      : "";

                    return (
                      <JmTableRow
                        key={row.rowKey}
                        className={`cursor-pointer ${childRowClass}`}
                        onClick={() => openDetail(order.id, item.id)}
                      >
                        {/* 1. 주문번호 — 첫 행에만 (order-level) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                className="block truncate font-mono text-jm-sm font-medium text-[var(--jm-text)]"
                                title={order.orderNo}
                              >
                                {order.orderNo}
                              </span>
                              {order.channelOrderNo && (
                                <span
                                  className="block truncate font-mono text-jm-3xs text-[var(--jm-text-subtle)]"
                                  title={order.channelOrderNo}
                                >
                                  {order.channelOrderNo}
                                </span>
                              )}
                            </div>
                          ) : null}
                        </JmTableCell>

                        {/* 2. 채널 — 첫 행에만 (order-level) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <ChannelBadge channel={order.channel} />
                          ) : null}
                        </JmTableCell>

                        {/* 3. 출고 — 첫 행에만 (fulfillmentType: PICKUP/DELIVERY/SHIPPING) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <FulfillmentBadge type={order.fulfillmentType} />
                          ) : null}
                        </JmTableCell>

                        {/* 4. 고객 — 첫 행에만 (order-level) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <span className="text-jm-sm text-[var(--jm-text)]">
                              {order.customerName ?? "—"}
                            </span>
                          ) : null}
                        </JmTableCell>

                        {/* 5. 품목 — 모든 행.
                            들여쓰기 정책: parentItemId 있는 자식 라인만 (OPTION_REF/ADDON).
                            같은 주문의 다른 메인(MAIN) 라인은 들여쓰기 없이 평행 표시.
                            라벨 prefix 로 자식 라인 종류 명시. SWAP 발생 시 chip 으로 진입 SKU 부속. */}
                        <JmTableCell>
                          <div
                            className={`flex flex-col gap-0.5 ${
                              item.parentItemId ? "pl-4" : ""
                            }`}
                          >
                            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                              <span
                                className="line-clamp-2 text-jm-sm text-[var(--jm-text)]"
                                title={item.product?.name ?? item.serviceName ?? ""}
                              >
                                {item.lineRole === "OPTION_REF" && (
                                  <span className="mr-1 text-[var(--jm-text-muted)]">
                                    ↳ 옵션
                                  </span>
                                )}
                                {item.lineRole === "ADDON" && (
                                  <span className="mr-1 text-[var(--jm-text-muted)]">
                                    ↳ 추가구매
                                  </span>
                                )}
                                {item.product?.name ??
                                  item.serviceName ??
                                  "—"}
                                {/* 옵션값 부속 텍스트 — SWAP 결과(상품명에 이미 색상 포함) 는 중복이라 표시 안 함.
                                    비매핑/cross-sell self (entryProductId === productId 또는 null) 만 표시 */}
                                {item.optionSnapshot &&
                                  Object.keys(item.optionSnapshot).length > 0 &&
                                  (!item.entryProductId ||
                                    item.entryProductId === item.product?.id) && (
                                    <span className="text-[var(--jm-text-muted)]">
                                      {" "}
                                      (
                                      {Object.values(item.optionSnapshot).join(
                                        " · ",
                                      )}
                                      )
                                    </span>
                                  )}
                              </span>
                              {/* SWAP chip — entryProduct 가 있고 결제 SKU 와 다를 때만 (자사몰 funnel).
                                  상품명 라인 옆에 위치 — 어떤 카탈로그에서 진입했는지 한눈에 인지 */}
                              {item.entryProduct &&
                                item.entryProductId !== item.product?.id && (
                                  <span
                                    className="inline-flex items-center rounded-md bg-[var(--jm-surface-muted)] px-1.5 py-px text-jm-3xs text-[var(--jm-text-muted)]"
                                    title={`손님이 진입한 카탈로그 SKU: ${item.entryProduct.sku}`}
                                  >
                                    ← 진입: {item.entryProduct.name}
                                  </span>
                                )}
                            </div>
                            {item.product?.sku && (
                              <span className="font-mono text-jm-3xs text-[var(--jm-text-subtle)]">
                                {item.product.sku}
                              </span>
                            )}
                            {/* PENDING + canonical/OPTION_PARENT — "변형 미확정" 배지 (상세 시트에서 출고 SKU 선택) */}
                            {order.status === "PENDING" &&
                              item.product &&
                              (item.product.isCanonical ||
                                item.product.productType ===
                                  "OPTION_PARENT") && (
                                <span
                                  className="mt-0.5 inline-flex w-fit items-center rounded-md bg-[var(--jm-warning-bg)] px-1.5 py-px text-jm-3xs font-semibold text-[var(--jm-warning-fg)]"
                                  title="출고 SKU 가 확정되지 않았습니다 — 상세에서 선택"
                                >
                                  {item.product.productType === "OPTION_PARENT"
                                    ? "옵션 미확정"
                                    : "변형 미확정"}
                                </span>
                              )}
                          </div>
                        </JmTableCell>

                        {/* 6. 수량 — 라인 단위 + progress bar */}
                        <JmTableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-jm-xs tabular-nums text-[var(--jm-text-muted)]">
                              {Number(item.quantity).toLocaleString("ko-KR")}개
                            </span>
                            <PartialProgress
                              status={order.status}
                              totalQty={Number(item.quantity)}
                              shippedQty={Number(item.shippedQty)}
                              returnedQty={Number(item.returnedQty)}
                            />
                          </div>
                        </JmTableCell>

                        {/* 7. 금액 — 라인 단위. 정확한 주문 총합은 상세 시트 / 매출 리포트에서 */}
                        <JmTableCell className="text-right">
                          <span className="text-jm-sm font-medium tabular-nums text-[var(--jm-text)]">
                            ₩{Number(item.totalPrice).toLocaleString("ko-KR")}
                          </span>
                        </JmTableCell>

                        {/* 8. 배송비 — 첫 행에만 (order-level). PICKUP 은 배송비 자체 무관 → 빈 셀 */}
                        <JmTableCell>
                          {isFirstInGroup &&
                          order.fulfillmentType !== "PICKUP" ? (
                            <ShippingPaymentBadge
                              type={order.shippingPaymentType}
                            />
                          ) : null}
                        </JmTableCell>

                        {/* 9. 결제 — 첫 행에만 (order-level paymentStatus) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <PaymentStatusBadge
                              status={order.paymentStatus}
                              showPaid
                            />
                          ) : null}
                        </JmTableCell>

                        {/* 9. 상태 — item-level phase + 발송 회차 (분할 발송 시 "{N}회 발송완료") */}
                        <JmTableCell>
                          <ItemPhaseBadge
                            phase={phase}
                            claimType={order.claimType}
                            shipmentCount={order.shipmentCount}
                          />
                        </JmTableCell>

                        {/* 10. 출고예정 — 첫 행에만 (order-level expectedShipDate) */}
                        <JmTableCell>
                          {isFirstInGroup ? (
                            <ShipDateCell
                              status={order.status}
                              expectedShipDate={order.expectedShipDate}
                              daysUntil={days}
                            />
                          ) : null}
                        </JmTableCell>

                        {/* 11. 액션 — 첫 행에만 (order 단위) */}
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
                            {isFirstInGroup && (
                              <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
                            )}
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
        highlightItemId={detailItemId}
        open={!!detailId}
        onOpenChange={(o) => !o && closeDetail()}
      />

      {/* prepare 가드로 막힌 변형/옵션 일괄 해결 — 확정 후 자동 prepare 재시도 */}
      {resolveContext && (
        <VariantResolveDialog
          open={!!resolveContext}
          onOpenChange={(v) => !v && setResolveContext(null)}
          orderId={resolveContext.orderId}
          items={resolveContext.items}
          retryLabel="확정 후 출고대기 재시도"
          onResolved={() => {
            const id = resolveContext.orderId;
            setResolveContext(null);
            transitionMutation.mutate({ id, action: "prepare" });
          }}
        />
      )}
    </div>
  );
}
