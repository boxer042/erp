"use client";

import { JmBadge, JmSkeleton, JmTableCell, JmTableRow } from "@/jm";
import { statusLabels, type PurchaseOrderStatus } from "./_types";

/** PurchaseOrderStatus → JmBadge variant */
type BadgeVariant =
  | "default"
  | "outline"
  | "solid"
  | "success"
  | "warning"
  | "danger"
  | "info";

const STATUS_VARIANT: Record<PurchaseOrderStatus, BadgeVariant> = {
  DRAFT: "default",
  SENT: "info",
  CONFIRMED: "info",
  COUNTER_OFFER: "warning",
  PARTIAL: "warning",
  PARTIAL_RESENT: "warning",
  PARTIAL_REACCEPTED: "warning",
  PARTIAL_COMPLETED: "success",
  RECEIVED: "success",
  CLOSED: "default",
  CANCELLED: "danger",
};

/** 상태 배지 */
export function PoStatusBadge({ status, size = "sm" }: { status: PurchaseOrderStatus; size?: "sm" | "md" | "lg" }) {
  return (
    <JmBadge variant={STATUS_VARIANT[status]} size={size} shape="square">
      {statusLabels[status]}
    </JmBadge>
  );
}

/** 입고 진행 미니 바 — 확정(초록) / 대기(파랑) / 잔량(회색) 3색 */
export function ProgressMini({
  progress,
}: {
  progress: { ordered: number; received: number; pending: number; percentReceived: number; percentPending: number };
}) {
  const { ordered, received, pending, percentReceived, percentPending } = progress;
  const title = pending > 0
    ? `확정 ${received.toLocaleString("ko-KR")} · 대기 ${pending.toLocaleString("ko-KR")} · 발주 ${ordered.toLocaleString("ko-KR")}`
    : `${received.toLocaleString("ko-KR")} / ${ordered.toLocaleString("ko-KR")}`;
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[var(--jm-surface-muted)]">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--jm-success-solid)]"
          style={{ width: `${percentReceived}%` }}
        />
        <div
          className="absolute inset-y-0 bg-[var(--jm-info-solid)]"
          style={{ left: `${percentReceived}%`, width: `${percentPending}%` }}
        />
      </div>
      <span className="text-jm-2xs tabular-nums text-[var(--jm-text-muted)]">
        {received.toLocaleString("ko-KR")}
        {pending > 0 ? <span className="text-[var(--jm-info-fg)]">+{pending.toLocaleString("ko-KR")}</span> : null}
        /{ordered.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

/** 테이블 행 스켈레톤 */
export function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <JmTableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <JmTableCell key={i}>
          <JmSkeleton className="h-4 w-full" />
        </JmTableCell>
      ))}
    </JmTableRow>
  );
}

/** 상태 필터 칩 옵션 */
export const FILTER_STATUSES: Array<{ value: "all" | PurchaseOrderStatus; label: string }> = [
  { value: "all", label: "전체" },
  { value: "DRAFT", label: "작성중" },
  { value: "SENT", label: "발송" },
  { value: "CONFIRMED", label: "수락" },
  { value: "COUNTER_OFFER", label: "단가 협상" },
  { value: "PARTIAL", label: "부분입고" },
  { value: "RECEIVED", label: "입고완료" },
];
