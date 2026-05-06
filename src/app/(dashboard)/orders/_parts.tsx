"use client";

import { JmBadge, JmSkeleton } from "@/jm";
import { Truck, Package, Store } from "lucide-react";
import {
  FULFILLMENT_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  type FulfillmentType,
  type OrderStatus,
} from "./_types";

/** STATUS_VARIANTS (shadcn 톤) → JmBadge variant 매핑 */
export function statusBadgeVariant(
  status: OrderStatus,
): "default" | "outline" | "solid" | "success" | "warning" | "danger" | "info" {
  const v = STATUS_VARIANTS[status];
  if (v === "warning") return "warning";
  if (v === "destructive") return "danger";
  if (v === "success") return "success";
  if (v === "secondary") return "default";
  if (v === "outline") return "outline";
  return "info";
}

/** 상태 배지 — 테이블 셀에서 사용 */
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <JmBadge variant={statusBadgeVariant(status)} size="sm" shape="square">
      {STATUS_LABELS[status]}
    </JmBadge>
  );
}

/** 출고 방식 + 아이콘 */
export function FulfillmentBadge({ type }: { type: FulfillmentType }) {
  const Icon = type === "DELIVERY" ? Truck : type === "SHIPPING" ? Package : Store;
  return (
    <JmBadge variant="outline" size="sm" shape="square">
      <Icon className="size-3" />
      {FULFILLMENT_LABELS[type]}
    </JmBadge>
  );
}

/** 출고예정일 — D+N / 오늘 / 지연 / 미정 */
export function ShipDateCell({
  expectedShipDate,
  daysUntil,
}: {
  expectedShipDate: string | null;
  daysUntil: number | null;
}) {
  if (!expectedShipDate) {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">예정일 미정</span>
    );
  }
  if (daysUntil == null) return null;
  if (daysUntil < 0) {
    return (
      <span className="text-[12px] font-semibold text-[var(--jm-danger-fg)] tabular-nums">
        {Math.abs(daysUntil)}일 지연
      </span>
    );
  }
  const dateStr = new Date(expectedShipDate).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
  if (daysUntil === 0) {
    return (
      <span className="flex flex-col text-[12px] tabular-nums">
        <span className="font-semibold text-[var(--jm-text)]">오늘</span>
        <span className="text-[11px] text-[var(--jm-text-muted)]">{dateStr}</span>
      </span>
    );
  }
  if (daysUntil === 1) {
    return (
      <span className="flex flex-col text-[12px] tabular-nums">
        <span className="text-[var(--jm-text)]">내일</span>
        <span className="text-[11px] text-[var(--jm-text-muted)]">{dateStr}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col text-[12px] tabular-nums">
      <span className="text-[var(--jm-text)]">{dateStr}</span>
      <span className="text-[11px] text-[var(--jm-text-muted)]">D+{daysUntil}</span>
    </span>
  );
}

/** 테이블 행 스켈레톤 */
export function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[var(--jm-border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <JmSkeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}
