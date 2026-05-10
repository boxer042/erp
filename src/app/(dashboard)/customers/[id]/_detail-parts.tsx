"use client";

import { JmBadge } from "@/jm";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANTS,
  RENTAL_STATUS_LABELS,
  RENTAL_STATUS_VARIANTS,
  REPAIR_STATUS_LABELS,
  REPAIR_STATUS_VARIANTS,
  REPAIR_TYPE_LABELS,
  type OrderStatus,
  type RentalStatus,
  type RepairStatus,
  type RepairType,
  type SerialSource,
} from "./_detail-types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <JmBadge variant={ORDER_STATUS_VARIANTS[status]} size="sm" shape="square">
      {ORDER_STATUS_LABELS[status]}
    </JmBadge>
  );
}

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <JmBadge variant={REPAIR_STATUS_VARIANTS[status]} size="sm" shape="square">
      {REPAIR_STATUS_LABELS[status]}
    </JmBadge>
  );
}

export function RentalStatusBadge({ status }: { status: RentalStatus }) {
  return (
    <JmBadge variant={RENTAL_STATUS_VARIANTS[status]} size="sm" shape="square">
      {RENTAL_STATUS_LABELS[status]}
    </JmBadge>
  );
}

export function RepairTypeBadge({ type }: { type: RepairType }) {
  return (
    <JmBadge variant="outline" size="sm" shape="square">
      {REPAIR_TYPE_LABELS[type]}
    </JmBadge>
  );
}

export function SerialSourceBadge({ source }: { source: SerialSource }) {
  return (
    <JmBadge
      variant={source === "SALE" ? "info" : "warning"}
      size="sm"
      shape="square"
    >
      {source === "SALE" ? "판매" : "수리"}
    </JmBadge>
  );
}

/**
 * key-value 한 행 — `<dt>` 라벨, `<dd>` 값. 값 없으면 "—" 노출.
 */
export function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3">
      <dt className="text-jm-xs text-[var(--jm-text-muted)]">{label}</dt>
      <dd className="text-jm-sm text-[var(--jm-text)] break-words">
        {value || (
          <span className="text-[var(--jm-text-subtle)]">—</span>
        )}
      </dd>
    </div>
  );
}
