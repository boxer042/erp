"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  PackageX,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmCard,
  JmEmpty,
  JmIconButton,
  JmPill,
  JmSearchInput,
  JmSpinner,
  JmStat,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
  JmTableToolbar,
  JmTableToolbarFilters,
  JmTableToolbarSearch,
} from "@/jm";

import { OrderDetailSheet } from "../_detail-sheet";
import { ChannelBadge, ItemPhaseBadge, TableRowSkeleton } from "../_parts";
import {
  CLAIM_REASON_LABELS,
  CLAIM_TYPE_LABELS,
  STATUS_LABELS,
  type OrderListItem,
  deriveItemPhase,
} from "../_types";

/**
 * 반품 처리 전용 뷰 — RETURN_REQUESTED ~ RETURN_INSPECTED 만 모은 페이지.
 * 워크보드는 출고+반품 모두 다루므로 클레임 batch 처리에는 어수선함 → 별도 진입점.
 *
 * 4 그룹으로 분리:
 *   - 요청 접수 (RETURN_REQUESTED) — 수락/반려 결정 대기
 *   - 회수 대기 (RETURN_ACCEPTED) — 손님이 반송 중
 *   - 회수 완료 (RETURN_COLLECTED) — 검수 진행 대기
 *   - 검수 완료 (RETURN_INSPECTED) — 환불/교환 종결 대기
 */
type ClaimGroup =
  | "RETURN_REQUESTED"
  | "RETURN_ACCEPTED"
  | "RETURN_PICKING"
  | "RETURN_COLLECTED"
  | "RETURN_INSPECTED";

const GROUP_LABELS: Record<ClaimGroup, string> = {
  RETURN_REQUESTED: "요청 접수",
  RETURN_ACCEPTED: "회수 대기",
  RETURN_PICKING: "회수 중",
  RETURN_COLLECTED: "회수 완료",
  RETURN_INSPECTED: "검수 완료",
};

const GROUP_HINTS: Record<ClaimGroup, string> = {
  RETURN_REQUESTED: "수락 / 반려 결정",
  RETURN_ACCEPTED: "회수 라벨 발급 대기",
  RETURN_PICKING: "택배 회수 진행",
  RETURN_COLLECTED: "검수 진행 대기",
  RETURN_INSPECTED: "환불 / 교환 종결",
};

const GROUP_ORDER: ClaimGroup[] = [
  "RETURN_REQUESTED",
  "RETURN_ACCEPTED",
  "RETURN_PICKING",
  "RETURN_COLLECTED",
  "RETURN_INSPECTED",
];

export default function ClaimsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<ClaimGroup | "all">("all");
  const detailId = searchParams.get("id");

  const claimsQuery = useQuery({
    queryKey: ["orders", "claims", appliedSearch],
    queryFn: () => {
      const p = new URLSearchParams({ view: "claims" });
      if (appliedSearch) p.set("search", appliedSearch);
      return apiGet<OrderListItem[]>(`/api/orders?${p}`);
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
        | "accept_return"
        | "reject_return"
        | "start_picking"
        | "collect_return"
        | "inspect_return"
        | "reject_inspection"
        | "refund"
        | "exchange";
    }) => apiMutate(`/api/orders/${id}`, "PUT", { action }),
    onSuccess: (_d, vars) => {
      const labels: Record<string, string> = {
        accept_return: "수락 — 회수 대기",
        reject_return: "반려 — 배송완료 복귀",
        start_picking: "회수 시작 — 택배 라벨 발급",
        collect_return: "회수완료 — 검수 진행",
        inspect_return: "검수완료 — 종결 대기",
        reject_inspection: "검수 반려 — 손님 반송",
        refund: "반품완료 — 환불 처리",
        exchange: "교환완료 — 새 주문 생성",
      };
      toast.success(labels[vars.action] ?? "처리되었습니다");
      invalidate();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "처리에 실패했습니다",
      ),
  });

  const all = claimsQuery.data ?? [];

  const groups = useMemo(() => {
    const out: Record<ClaimGroup, OrderListItem[]> = {
      RETURN_REQUESTED: [],
      RETURN_ACCEPTED: [],
      RETURN_PICKING: [],
      RETURN_COLLECTED: [],
      RETURN_INSPECTED: [],
    };
    for (const o of all) {
      const g = o.status as ClaimGroup;
      if (g in out) out[g].push(o);
    }
    return out;
  }, [all]);

  const visible =
    activeGroup === "all"
      ? all
      : groups[activeGroup];

  const openDetail = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("id", id);
    router.push(`/orders/claims?${sp.toString()}`);
  };
  const closeDetail = () => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("id");
    const q = sp.toString();
    router.push(`/orders/claims${q ? `?${q}` : ""}`);
  };

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      {/* 헤더 */}
      <div className="border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 py-3">
        <div className="flex items-center gap-2">
          <JmIconButton
            aria-label="주문 워크보드로"
            onClick={() => router.push("/orders")}
          >
            <ChevronLeft className="size-4" />
          </JmIconButton>
          <div className="flex flex-1 flex-col">
            <h1 className="text-jm-md font-semibold">반품/교환 처리</h1>
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              요청 → 회수 → 검수 → 환불/교환 흐름의 클레임 batch 처리
            </p>
          </div>
          <JmIconButton
            aria-label="새로고침"
            onClick={() => claimsQuery.refetch()}
          >
            <RefreshCw
              className={`size-4 ${claimsQuery.isFetching ? "animate-spin" : ""}`}
            />
          </JmIconButton>
        </div>
      </div>

      <div className="flex w-full flex-col gap-6 p-4">
        {/* KPI — 그룹별 카운트 (정보 표시) */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {GROUP_ORDER.map((g) => (
            <JmStat
              key={g}
              label={GROUP_LABELS[g]}
              value={groups[g].length}
              hint={GROUP_HINTS[g]}
              size="sm"
            />
          ))}
        </div>

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
                    setAppliedSearch(search.trim());
                  }
                }}
                placeholder="주문번호 · 채널주문번호 · 고객"
              />
            </JmTableToolbarSearch>
            <JmTableToolbarFilters>
              <JmPill
                size="sm"
                active={activeGroup === "all"}
                onClick={() => setActiveGroup("all")}
              >
                전체 <span className="ml-1 tabular-nums">{all.length}</span>
              </JmPill>
              {GROUP_ORDER.map((g) => (
                <JmPill
                  key={g}
                  size="sm"
                  active={activeGroup === g}
                  onClick={() => setActiveGroup(g)}
                >
                  {GROUP_LABELS[g]}
                  {groups[g].length > 0 && (
                    <span className="ml-1 tabular-nums">{groups[g].length}</span>
                  )}
                </JmPill>
              ))}
            </JmTableToolbarFilters>
          </JmTableToolbar>

          <JmTable className="min-w-[1000px]">
            <JmTableHeader>
              <JmTableRow>
                <JmTableHead className="w-[150px]">주문번호</JmTableHead>
                <JmTableHead className="w-[100px]">채널</JmTableHead>
                <JmTableHead className="w-[140px]">고객</JmTableHead>
                <JmTableHead>품목</JmTableHead>
                <JmTableHead className="w-[100px]">유형</JmTableHead>
                <JmTableHead className="w-[120px]">사유</JmTableHead>
                <JmTableHead className="w-[110px]">단계</JmTableHead>
                <JmTableHead className="w-[260px] text-right">액션</JmTableHead>
              </JmTableRow>
            </JmTableHeader>
            <JmTableBody>
              {claimsQuery.isPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))
              ) : visible.length === 0 ? (
                <JmTableRow className="hover:bg-transparent">
                  <JmTableCell colSpan={8} className="py-12">
                    <JmEmpty
                      icon={<PackageX className="size-8" />}
                      title="처리 대기 클레임 없음"
                      description="모두 종결되었거나 아직 접수된 반품·교환이 없습니다"
                    />
                  </JmTableCell>
                </JmTableRow>
              ) : (
                visible.map((order) => (
                  <ClaimRow
                    key={order.id}
                    order={order}
                    onOpen={() => openDetail(order.id)}
                    onAction={(action) =>
                      transitionMutation.mutate({ id: order.id, action })
                    }
                    pending={
                      transitionMutation.isPending &&
                      transitionMutation.variables?.id === order.id
                    }
                  />
                ))
              )}
            </JmTableBody>
          </JmTable>
        </JmCard>
      </div>

      <OrderDetailSheet
        orderId={detailId}
        highlightItemId={null}
        open={!!detailId}
        onOpenChange={(o) => !o && closeDetail()}
      />
    </div>
  );
}

function ClaimRow({
  order,
  onOpen,
  onAction,
  pending,
}: {
  order: OrderListItem;
  onOpen: () => void;
  onAction: (
    action:
      | "accept_return"
      | "reject_return"
      | "start_picking"
      | "collect_return"
      | "inspect_return"
      | "reject_inspection"
      | "refund"
      | "exchange",
  ) => void;
  pending: boolean;
}) {
  const firstItem = order.items[0];
  const lineCount = order.items.length;
  const phase = deriveItemPhase(
    order.status,
    Number(firstItem?.quantity ?? 0),
    Number(firstItem?.shippedQty ?? 0),
    Number(firstItem?.returnedQty ?? 0),
  );

  // 단계별 다음 액션 — 가장 의미 있는 1~2 개만 inline. 나머지는 [상세] 클릭으로.
  type Action = Parameters<typeof onAction>[0];
  const actions: { action: Action; label: string; tone: "primary" | "ghost" }[] =
    [];
  switch (order.status) {
    case "RETURN_REQUESTED":
      actions.push({ action: "accept_return", label: "수락", tone: "primary" });
      actions.push({ action: "reject_return", label: "반려", tone: "ghost" });
      break;
    case "RETURN_ACCEPTED":
      actions.push({
        action: "start_picking",
        label: "회수 시작",
        tone: "ghost",
      });
      actions.push({
        action: "collect_return",
        label: "회수완료",
        tone: "primary",
      });
      break;
    case "RETURN_PICKING":
      actions.push({
        action: "collect_return",
        label: "회수완료",
        tone: "primary",
      });
      break;
    case "RETURN_COLLECTED":
      actions.push({
        action: "inspect_return",
        label: "검수완료",
        tone: "primary",
      });
      break;
    case "RETURN_INSPECTED":
      // 환불/교환은 부분 처리 가능 — 상세에서 더 정교하게. 여기선 전액만 노출.
      if (
        order.claimType === "EXCHANGE_SAME" ||
        order.claimType === "EXCHANGE_DIFFERENT"
      ) {
        actions.push({ action: "exchange", label: "교환완료", tone: "primary" });
      } else {
        actions.push({ action: "refund", label: "반품완료", tone: "primary" });
      }
      actions.push({
        action: "reject_inspection",
        label: "검수 반려",
        tone: "ghost",
      });
      break;
  }

  return (
    <JmTableRow
      className="cursor-pointer hover:bg-[var(--jm-surface-muted)]"
      onClick={onOpen}
    >
      <JmTableCell>
        <div className="flex flex-col">
          <span className="font-mono text-jm-sm font-medium text-[var(--jm-text)]">
            {order.orderNo}
          </span>
          {order.channelOrderNo && (
            <span className="font-mono text-jm-3xs text-[var(--jm-text-subtle)]">
              {order.channelOrderNo}
            </span>
          )}
        </div>
      </JmTableCell>
      <JmTableCell>
        <ChannelBadge channel={order.channel} />
      </JmTableCell>
      <JmTableCell>
        <div className="flex flex-col">
          <span className="line-clamp-1 text-jm-xs text-[var(--jm-text)]">
            {order.customerName ?? "—"}
          </span>
          {order.customerPhone && (
            <span className="font-mono text-jm-3xs text-[var(--jm-text-subtle)]">
              {order.customerPhone}
            </span>
          )}
        </div>
      </JmTableCell>
      <JmTableCell>
        <div className="flex flex-col">
          <span className="line-clamp-1 text-jm-xs text-[var(--jm-text)]">
            {firstItem?.product?.name ?? firstItem?.serviceName ?? "—"}
          </span>
          {lineCount > 1 && (
            <span className="text-jm-3xs text-[var(--jm-text-muted)]">
              외 {lineCount - 1}건
            </span>
          )}
        </div>
      </JmTableCell>
      <JmTableCell>
        <span className="text-jm-xs text-[var(--jm-text)]">
          {order.claimType ? CLAIM_TYPE_LABELS[order.claimType] : "—"}
        </span>
      </JmTableCell>
      <JmTableCell>
        <span className="line-clamp-1 text-jm-xs text-[var(--jm-text-muted)]">
          {order.claimReason ? CLAIM_REASON_LABELS[order.claimReason] : "—"}
        </span>
      </JmTableCell>
      <JmTableCell>
        <ItemPhaseBadge phase={phase} claimType={order.claimType} />
      </JmTableCell>
      <JmTableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5">
          {actions.map((a) => (
            <JmButton
              key={a.action}
              size="xs"
              variant={a.tone === "primary" ? "cta" : "ghost"}
              onClick={() => onAction(a.action)}
              disabled={pending}
            >
              {pending ? <JmSpinner size="xs" tone="inverted" /> : null}
              {a.label}
            </JmButton>
          ))}
          <ChevronRight className="size-4 shrink-0 text-[var(--jm-text-subtle)]" />
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}

// status 라벨 별도 안 import — STATUS_LABELS 가 이미 export 됨
void STATUS_LABELS;
