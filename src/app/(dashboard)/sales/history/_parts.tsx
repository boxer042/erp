"use client";

import { JmBadge, JmSkeleton } from "@/jm";
import {
  ArrowLeftRight,
  PackageCheck,
  RotateCcw,
  Wrench,
} from "lucide-react";
import {
  StatusBadge,
  PaymentStatusBadge,
  ChannelBadge,
} from "../../orders/_parts";
import {
  CLAIM_REASON_LABELS,
  CLAIM_TYPE_LABELS,
  type OrderClaimReason,
  type OrderClaimType,
  type OrderStatus,
} from "../../orders/_types";
import {
  formatCompactKrw,
  formatKrw,
} from "./_helpers";
import type { SalesHistoryRow, SalesHistorySummary } from "./_types";

/**
 * 통합 판매내역 전용 상태 배지.
 * orphan 행 (PICKED_UP / 임대 RETURNED) 도 처리.
 */
export function SalesStatusBadge({
  row,
}: {
  row: Pick<
    SalesHistoryRow,
    "status" | "channelId" | "claimType" | "isExchangeReplacement" | "isOrphan" | "type" | "fulfillmentType"
  >;
}) {
  // orphan 수리 — PICKED_UP
  if (row.status === "PICKED_UP") {
    return (
      <JmBadge variant="success" size="md" shape="square">
        <Wrench className="size-3" />
        수리완료
      </JmBadge>
    );
  }
  // orphan 임대 반납완료 — Order RETURNED 와 의미가 달라 별도 라벨
  if (row.isOrphan && row.type === "rental" && row.status === "RETURNED") {
    return (
      <JmBadge variant="success" size="md" shape="square">
        <PackageCheck className="size-3" />
        반납완료
      </JmBadge>
    );
  }
  return (
    <StatusBadge
      status={row.status as OrderStatus}
      channelId={row.channelId}
      claimType={row.claimType}
      isExchangeReplacement={row.isExchangeReplacement}
      fulfillmentType={row.fulfillmentType}
    />
  );
}

/** 클레임 배지 — claimType + claimReason 결합. 없으면 null. */
export function ClaimBadge({
  claimType,
  claimReason,
}: {
  claimType: OrderClaimType | null;
  claimReason: OrderClaimReason | null;
}) {
  if (!claimType) return null;
  const isExchange =
    claimType === "EXCHANGE_SAME" || claimType === "EXCHANGE_DIFFERENT";
  const Icon = isExchange ? ArrowLeftRight : RotateCcw;
  return (
    <div className="flex flex-col gap-0.5">
      <JmBadge
        variant={isExchange ? "accent" : "warning"}
        size="sm"
        shape="square"
      >
        <Icon className="size-3" />
        {CLAIM_TYPE_LABELS[claimType]}
      </JmBadge>
      {claimReason && (
        <span className="text-[11px] text-[var(--jm-text-subtle)]">
          {CLAIM_REASON_LABELS[claimReason]}
        </span>
      )}
    </div>
  );
}

/** 타입 배지 — 판매/수리/임대 시각 구분. 수리는 workKind 가 CUSTOM_BUILD 면 "리빌드" 로 분기. */
export function TypeBadge({
  type,
  repairWorkKind,
}: {
  type: SalesHistoryRow["type"];
  repairWorkKind?: SalesHistoryRow["repairWorkKind"];
}) {
  if (type === "repair") {
    if (repairWorkKind === "CUSTOM_BUILD") {
      return (
        <JmBadge variant="accent" size="sm" shape="square">
          리빌드
        </JmBadge>
      );
    }
    return (
      <JmBadge variant="info" size="sm" shape="square">
        수리
      </JmBadge>
    );
  }
  if (type === "rental") {
    return (
      <JmBadge variant="accent" size="sm" shape="square">
        임대
      </JmBadge>
    );
  }
  return (
    <JmBadge variant="default" size="sm" shape="square">
      판매
    </JmBadge>
  );
}

/**
 * 금액 셀 — 환불/매출취소된 행은 line-through + danger.
 * 외상은 amber 색.
 */
export function SalesAmountCell({ row }: { row: SalesHistoryRow }) {
  const reversed =
    row.status === "RETURNED" ||
    row.paymentStatus === "REFUNDED" ||
    row.paymentStatus === "SALES_CANCELLED";
  const unpaid = row.paymentStatus === "UNPAID";
  return (
    <span
      className={`tabular-nums font-semibold ${
        reversed
          ? "text-[var(--jm-text-muted)] line-through"
          : unpaid
            ? "text-[var(--jm-warning-fg)]"
            : "text-[var(--jm-text)]"
      }`}
    >
      {formatKrw(row.amount)}
    </span>
  );
}

/** 채널 분포 한 줄 — 메인 카드 헤더 아래에 노출. 클릭 시 채널 필터 적용. */
export function ChannelDistribution({
  channels,
  totalNet,
  activeChannelFilter,
  onSelect,
}: {
  channels: SalesHistorySummary["byChannel"];
  totalNet: number;
  /** "all" | "offline" | <channelId> */
  activeChannelFilter: string;
  onSelect: (filter: string) => void;
}) {
  if (channels.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-4 py-2.5 text-[12px]">
      <span className="font-medium text-[var(--jm-text-subtle)]">
        채널별 매출
      </span>
      <ChannelChip
        label="전체"
        amount={totalNet}
        share={100}
        active={activeChannelFilter === "all"}
        onClick={() => onSelect("all")}
      />
      {channels.map((c) => {
        const share = totalNet > 0 ? (c.amount / totalNet) * 100 : 0;
        const filter = c.channelId ?? "offline";
        return (
          <ChannelChip
            key={filter}
            label={c.channelName}
            amount={c.amount}
            share={share}
            active={activeChannelFilter === filter}
            onClick={() => onSelect(filter)}
          />
        );
      })}
    </div>
  );
}

function ChannelChip({
  label,
  amount,
  share,
  active,
  onClick,
}: {
  label: string;
  amount: number;
  share: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors tabular-nums ${
        active
          ? "bg-[var(--jm-surface)] text-[var(--jm-text)] border border-[var(--jm-border-strong)]"
          : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface)] hover:text-[var(--jm-text)]"
      }`}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[var(--jm-text)]">
        ₩{formatCompactKrw(amount)}
      </span>
      <span className="text-[11px] text-[var(--jm-text-subtle)]">
        {share.toFixed(0)}%
      </span>
    </button>
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

export { StatusBadge, PaymentStatusBadge, ChannelBadge };
