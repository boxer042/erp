"use client";

import { JmBadge, JmSkeleton } from "@/jm";
import {
  ArrowLeftRight,
  ChevronRight,
  Clock,
  Globe,
  Package,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import {
  FULFILLMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  type FulfillmentType,
  type OrderPaymentStatus,
  type OrderStatus,
} from "./_types";

/**
 * 시각 위계 정책 (배지 구분 명확성):
 *   1순위 출고 상태  — 색 채워진 배지(filled). dot 추가로 의미 강조. size md.
 *   2순위 결제 상태  — outline + 색 dot. 텍스트 muted. size sm.
 *   3순위 출고 방식  — outline + 아이콘 only(라벨 자동 hidden 가능). 회색 톤. size sm.
 *   3순위 채널       — 오프라인=default(muted), 외부=info(파랑) + 아이콘. size sm.
 *
 * 한 줄 동시 노출 시 색 충돌 방지:
 *   - 출고 상태 SHIPPED 만 solid 검정/브랜드 색 — 다른 줄의 어떤 배지와도 충돌 X
 *   - 결제 UNPAID 의 dot 은 danger(빨강), 출고 상태에는 빨강이 CANCELLED 뿐 → 워크보드엔 CANCELLED 안 나옴
 *   - 채널 외부=info(파랑), 출고 SHIPPED=solid(검정) — 색 분리됨
 */

/**
 * 출고 상태별 시각 매핑 — 색 + 의미 아이콘.
 * 진행 중 상태는 색 채워짐(filled), 종결 상태(CANCELLED/RETURNED/EXCHANGED)는 outline 으로 통일.
 */
const STATUS_VISUAL: Record<
  OrderStatus,
  {
    variant: "default" | "outline" | "solid" | "success" | "warning" | "danger" | "info";
    icon: React.ComponentType<{ className?: string }> | null;
  }
> = {
  PENDING: { variant: "warning", icon: Clock },
  PREPARING: { variant: "info", icon: Package },
  SHIPPED: { variant: "solid", icon: Truck },
  COMPLETED: { variant: "success", icon: PackageCheck },
  RETURN_REQUESTED: { variant: "warning", icon: RotateCcw },
  RETURN_ACCEPTED: { variant: "info", icon: PackageOpen },
  CANCELLED: { variant: "outline", icon: XCircle },
  RETURNED: { variant: "outline", icon: RotateCcw },
  EXCHANGED: { variant: "outline", icon: ArrowLeftRight },
};

/**
 * 출고 상태 배지 — 가장 두드러지게.
 * 색 채워진 배지 + 의미 아이콘. size md.
 */
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { variant, icon: Icon } = STATUS_VISUAL[status];
  return (
    <JmBadge variant={variant} size="md" shape="square">
      {Icon && <Icon className="size-3" />}
      {STATUS_LABELS[status]}
    </JmBadge>
  );
}

/**
 * 결제 상태 배지 — outline + 색 dot. 출고 상태와 시각 무게 분리.
 * 같은 줄에 출고 상태와 함께 노출되어도 outline 이라 가벼움.
 */
const PAYMENT_DOT: Record<OrderPaymentStatus, string> = {
  UNPAID: "bg-[var(--jm-danger-fg)]",
  PAID: "bg-[var(--jm-success-fg)]",
  PARTIAL_REFUND: "bg-[var(--jm-text-subtle)]",
  REFUNDED: "bg-[var(--jm-text-subtle)]",
};

export function PaymentStatusBadge({
  status,
  showPaid = false,
}: {
  status: OrderPaymentStatus;
  /** PAID 도 명시적으로 보일지 (상세 시트). 기본 false (리스트 노이즈 방지) */
  showPaid?: boolean;
}) {
  if (status === "PAID" && !showPaid) return null;
  return (
    <JmBadge variant="outline" size="sm" shape="square">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${PAYMENT_DOT[status]}`}
      />
      {PAYMENT_STATUS_LABELS[status]}
    </JmBadge>
  );
}

/**
 * 출고 방식 — 정보 전달용. default(muted gray) + 아이콘.
 * 출고 상태가 색을 가져가니 여기선 색 빠짐.
 */
export function FulfillmentBadge({ type }: { type: FulfillmentType }) {
  const Icon = type === "DELIVERY" ? Truck : type === "SHIPPING" ? Package : Store;
  return (
    <JmBadge variant="default" size="sm" shape="square">
      <Icon className="size-3" />
      {FULFILLMENT_LABELS[type]}
    </JmBadge>
  );
}

/**
 * 채널 — 오프라인은 default(muted), 외부 채널은 info(파랑).
 * 외부 채널이 시각적으로 도드라져 워크보드 한 눈에 origin 분류.
 */
export function ChannelBadge({
  channel,
}: {
  channel: { name: string; code: string } | null;
}) {
  if (!channel) {
    return (
      <JmBadge variant="default" size="sm" shape="square">
        <Store className="size-3" />
        오프라인
      </JmBadge>
    );
  }
  return (
    <JmBadge variant="info" size="sm" shape="square">
      <Globe className="size-3" />
      {channel.name}
    </JmBadge>
  );
}

/**
 * 출고예정일 셀.
 *  - 출고 흐름 (PENDING/PREPARING/SHIPPED): D+N / 오늘 / 지연 / 미정
 *  - 반품 처리 (RETURN_REQUESTED/RETURN_ACCEPTED): 반품 단계 텍스트로 대체
 */
export function ShipDateCell({
  status,
  expectedShipDate,
  daysUntil,
}: {
  status: OrderStatus;
  expectedShipDate: string | null;
  daysUntil: number | null;
}) {
  // 반품 처리 중인 주문 — 출고예정일은 의미 없음. 반품 단계 표시.
  if (status === "RETURN_REQUESTED") {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">
        매장 결정 대기
      </span>
    );
  }
  if (status === "RETURN_ACCEPTED") {
    return (
      <span className="text-[12px] text-[var(--jm-info-fg)]">회수 대기</span>
    );
  }
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

/**
 * 상태 흐름 가이드 — 출고/반품(환불)/교환 3축을 줄로 시각화.
 * StatusBadge 와 동일 시각 매핑 사용 — 행 배지와 가이드의 시각 일관성 보장.
 */
export function StatusFlowGuide() {
  const flowSteps: Array<{ status: OrderStatus; hint: string }> = [
    { status: "PENDING", hint: "접수" },
    { status: "PREPARING", hint: "재고 차감" },
    { status: "SHIPPED", hint: "송장 입력" },
    { status: "COMPLETED", hint: "종결" },
  ];
  const refundSteps: Array<{ status: OrderStatus; hint: string }> = [
    { status: "COMPLETED", hint: "" },
    { status: "RETURN_REQUESTED", hint: "매장 수락/반려" },
    { status: "RETURN_ACCEPTED", hint: "회수" },
    { status: "RETURNED", hint: "재고 복원·환불" },
  ];
  const exchangeSteps: Array<{ status: OrderStatus; hint: string }> = [
    { status: "RETURN_ACCEPTED", hint: "회수" },
    { status: "EXCHANGED", hint: "재고 복원 + 새 주문(-EX) 자동" },
  ];
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-[11px] text-[var(--jm-text-muted)]">
      <FlowRow label="출고" steps={flowSteps} />
      <FlowRow
        label="반품"
        steps={refundSteps}
        suffix="· 즉시 반품(1단계 단축) 가능"
      />
      <FlowRow
        label="교환"
        steps={exchangeSteps}
        suffix="· EXCHANGE_SAME(항목 복제) / EXCHANGE_DIFFERENT(빈 항목 + 차액 정산)"
      />
    </div>
  );
}

function FlowRow({
  label,
  steps,
  suffix,
}: {
  label: string;
  steps: Array<{ status: OrderStatus; hint: string }>;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-14 font-medium text-[var(--jm-text-subtle)]">
        {label}
      </span>
      {steps.map((s, i) => (
        <span key={s.status} className="inline-flex items-center gap-1.5">
          <StatusBadge status={s.status} />
          {s.hint && <span>{s.hint}</span>}
          {i < steps.length - 1 && (
            <ChevronRight className="size-3 text-[var(--jm-text-subtle)]" />
          )}
        </span>
      ))}
      {suffix && (
        <span className="ml-1 text-[var(--jm-text-subtle)]">{suffix}</span>
      )}
    </div>
  );
}

/**
 * 합계 셀 — 결제 상태가 별도 컬럼으로 분리되었으므로 여기선 금액만 단순 표시.
 * REFUNDED 만 line-through 로 "이미 환불된 돈" 신호 (정렬 시 한눈에 구분).
 */
export function AmountCell({
  totalAmount,
  paymentStatus,
}: {
  totalAmount: string;
  paymentStatus: OrderPaymentStatus;
}) {
  const amount = `₩${Number(totalAmount).toLocaleString("ko-KR")}`;
  const isRefunded =
    paymentStatus === "REFUNDED" || paymentStatus === "PARTIAL_REFUND";
  return (
    <span
      className={`tabular-nums font-semibold ${
        isRefunded
          ? "text-[var(--jm-text-muted)] line-through"
          : "text-[var(--jm-text)]"
      }`}
    >
      {amount}
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
