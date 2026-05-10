"use client";

import { JmBadge, JmSkeleton } from "@/jm";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Clock,
  Globe,
  Package,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Search,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import {
  FULFILLMENT_LABELS,
  ITEM_PHASE_LABELS,
  PAYMENT_STATUS_LABELS,
  statusLabel,
  type FulfillmentType,
  type ItemPhase,
  type OrderClaimType,
  type OrderPaymentStatus,
  type OrderStatus,
} from "./_types";

/**
 * 시각 위계 + 흐름별 색 통일 정책:
 *   - 출고 흐름  → info (파랑)         · 종결(COMPLETED) → success (초록)
 *   - 반품 흐름  → warning (노랑)       · 종결(RETURNED) → outline
 *   - 교환 흐름  → accent (보라)        · 종결(EXCHANGED) → outline
 *   - 교환 새 주문 (-EX) → 출고 단계지만 accent (보라) 로 분리 — 일반 출고와 식별
 *   - 취소(CANCELLED)  → outline (회색)
 *
 * 흐름 내 단계는 같은 색. 단계 차이는 텍스트 + 아이콘으로 구분.
 */

type BadgeVariant =
  | "default"
  | "outline"
  | "solid"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

interface StatusVisual {
  variant: BadgeVariant;
  icon: React.ComponentType<{ className?: string }> | null;
}

/** 정적 매핑 — claimType / 새 주문 여부 미고려한 기본값. resolveStatusVisual() 로 동적 분기. */
const STATUS_VISUAL_DEFAULT: Record<OrderStatus, StatusVisual> = {
  PENDING: { variant: "info", icon: Clock },
  PREPARING: { variant: "info", icon: Package },
  PREPARING_PACKED: { variant: "info", icon: PackageCheck },
  SHIPPED: { variant: "info", icon: Truck },
  COMPLETED: { variant: "success", icon: PackageCheck },
  RETURN_REQUESTED: { variant: "warning", icon: RotateCcw },
  RETURN_ACCEPTED: { variant: "warning", icon: PackageOpen },
  RETURN_COLLECTED: { variant: "warning", icon: PackageOpen },
  RETURN_INSPECTED: { variant: "warning", icon: Search },
  CANCELLED: { variant: "outline", icon: XCircle },
  RETURNED: { variant: "outline", icon: RotateCcw },
  EXCHANGED: { variant: "outline", icon: ArrowLeftRight },
};

/**
 * 동적 시각 매핑 — claimType / 교환 새 주문 여부에 따라 색 분기.
 *  - 교환 흐름 (claimType=EXCHANGE_*): 반품 단계의 warning → accent 로 변환
 *  - 교환 새 주문 (-EX): 출고 단계의 info → accent
 */
export function resolveStatusVisual(
  status: OrderStatus,
  ctx: {
    claimType?: OrderClaimType | null;
    isExchangeReplacement?: boolean;
  } = {},
): StatusVisual {
  const base = STATUS_VISUAL_DEFAULT[status];

  // 교환 새 주문 (-EX): 일반 출고 단계지만 accent 색으로 분리
  if (ctx.isExchangeReplacement && base.variant === "info") {
    return { ...base, variant: "accent" };
  }
  if (ctx.isExchangeReplacement && status === "COMPLETED") {
    return { ...base, variant: "outline" }; // 교환 새 주문의 종결도 outline
  }

  // 반품/교환 단계 — claimType 으로 색 분기
  const isExchangeClaim =
    ctx.claimType === "EXCHANGE_SAME" || ctx.claimType === "EXCHANGE_DIFFERENT";
  if (isExchangeClaim && base.variant === "warning") {
    return { ...base, variant: "accent" };
  }

  return base;
}

/**
 * Item-level phase 별 시각 톤. order.status + line 수량으로 derive 한 ItemPhase 를
 * 받아 색·아이콘 분기. 흐름별 색 정책은 StatusBadge 와 동일하게 통일.
 */
const ITEM_PHASE_VISUAL: Record<
  ItemPhase,
  {
    variant: BadgeVariant;
    icon: React.ComponentType<{ className?: string }> | null;
  }
> = {
  PENDING_LINE: { variant: "info", icon: Clock },
  WAITING_SHIP: { variant: "info", icon: Package },
  PARTIAL_SHIP: { variant: "info", icon: Truck },
  FULLY_SHIPPED: { variant: "success", icon: Check },
  DELIVERED: { variant: "success", icon: PackageCheck },
  RETURNING: { variant: "warning", icon: PackageOpen },
  PARTIAL_RETURN: { variant: "warning", icon: RotateCcw },
  RETURNED_LINE: { variant: "outline", icon: RotateCcw },
  EXCHANGED_LINE: { variant: "outline", icon: ArrowLeftRight },
  CANCELLED_LINE: { variant: "outline", icon: XCircle },
};

/**
 * 라인 단계 배지 — 같은 주문이라도 라인마다 진행률이 다르면 다른 라벨이 노출됨.
 *
 * 예: 카트 [A:3, B:2] 가 PREPARING 상태인데
 *   - A 라인 3개 다 발송 → "발송완료" (success)
 *   - B 라인 0/2 → "발송대기" (info)
 * → 사용자는 한눈에 "어떤 품목은 끝났고 어떤 품목은 진행중" 인지 인식 가능.
 *
 * claimType 이 EXCHANGE_* 인 반품 단계 라인은 색을 accent(보라) 로 분기.
 */
export function ItemPhaseBadge({
  phase,
  claimType,
}: {
  phase: ItemPhase;
  claimType?: OrderClaimType | null;
}) {
  const base = ITEM_PHASE_VISUAL[phase];
  const isExchange =
    claimType === "EXCHANGE_SAME" || claimType === "EXCHANGE_DIFFERENT";
  // 반품 진행 중 라벨이 교환 흐름이면 보라색으로 분기 (StatusBadge 정책과 동일)
  const variant: BadgeVariant =
    isExchange && (phase === "RETURNING" || phase === "PARTIAL_RETURN")
      ? "accent"
      : base.variant;
  const Icon = base.icon;
  return (
    <JmBadge variant={variant} size="md" shape="square">
      {Icon && <Icon className="size-3" />}
      {ITEM_PHASE_LABELS[phase]}
    </JmBadge>
  );
}

/**
 * 출고 상태 배지 — 동적 색·라벨.
 * 행에 ChannelId, ClaimType, 교환 여부 컨텍스트 받아 색·라벨 분기.
 */
export function StatusBadge({
  status,
  channelId,
  claimType,
  isExchangeReplacement,
}: {
  status: OrderStatus;
  channelId?: string | null;
  claimType?: OrderClaimType | null;
  isExchangeReplacement?: boolean;
}) {
  const { variant, icon: Icon } = resolveStatusVisual(status, {
    claimType,
    isExchangeReplacement,
  });
  return (
    <JmBadge variant={variant} size="md" shape="square">
      {Icon && <Icon className="size-3" />}
      {statusLabel(status, { channelId, claimType })}
    </JmBadge>
  );
}

/**
 * 부분 진행 인디케이터 — 라인 단위 진행률을 mini progress bar 로 시각화.
 *
 * 품목별 행 워크보드에선 각 라인의 cell 안에 노출 (한 OrderItem 의 quantity vs shippedQty/returnedQty).
 *
 *  진행 중:
 *    - PREPARING/PREPARING_PACKED/SHIPPED + 0 < shipped < total → 발송 N/M (info)
 *    - COMPLETED + 0 < returned < total: 반품 N/M (warning)
 *    - RETURNED/EXCHANGED + returned < total: 부분 반품/교환 N/M (muted · 잔량은 정상 종결)
 *
 * 분할 발송 이력 (`shipmentCount ≥ 2`) 은 order-level 정보이므로 별도의
 * `ShipmentSummaryChip` 컴포넌트가 그룹 첫 행에만 표시. 이 컴포넌트엔 포함 안 됨.
 *
 *  해당 없으면 null. 부모는 이를 받아 라인 셀 안에 렌더.
 */
export function PartialProgress({
  status,
  totalQty,
  shippedQty,
  returnedQty,
}: {
  status: OrderStatus;
  totalQty: number;
  shippedQty: number;
  returnedQty: number;
}) {
  if (totalQty <= 0) return null;

  type Tone = "info" | "warning" | "muted";
  let label: string | null = null;
  let value = 0;
  let tone: Tone = "info";

  const isShippingPhase =
    status === "PREPARING" ||
    status === "PREPARING_PACKED" ||
    status === "SHIPPED";
  if (isShippingPhase && shippedQty > 0 && shippedQty < totalQty) {
    label = "발송";
    value = shippedQty;
    tone = "info";
  } else if (
    status === "COMPLETED" &&
    returnedQty > 0 &&
    returnedQty < totalQty
  ) {
    label = "반품";
    value = returnedQty;
    tone = "warning";
  } else if (
    (status === "RETURNED" || status === "EXCHANGED") &&
    returnedQty > 0 &&
    returnedQty < totalQty
  ) {
    label = status === "EXCHANGED" ? "교환" : "반품";
    value = returnedQty;
    tone = "muted";
  }

  if (!label) return null;

  const pct = Math.min(100, Math.round((value / totalQty) * 100));
  const palette: Record<Tone, { bar: string; track: string; text: string }> = {
    info: {
      bar: "bg-[var(--jm-info-fg)]",
      track: "bg-[var(--jm-info-bg)]",
      text: "text-[var(--jm-info-fg)]",
    },
    warning: {
      bar: "bg-[var(--jm-warning-fg)]",
      track: "bg-[var(--jm-warning-bg)]",
      text: "text-[var(--jm-warning-fg)]",
    },
    muted: {
      bar: "bg-[var(--jm-text-subtle)]",
      track: "bg-[var(--jm-surface-muted)]",
      text: "text-[var(--jm-text-muted)]",
    },
  };
  const c = palette[tone];

  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 text-[11px] tabular-nums ${c.text}`}
    >
      <span className={`relative h-1 w-16 overflow-hidden rounded-full ${c.track}`}>
        <span
          className={`absolute inset-y-0 left-0 ${c.bar}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-medium">
        {label} {value}/{totalQty}
      </span>
    </span>
  );
}

/**
 * 분할 발송 이력 칩 — order 단위 정보. 그룹 첫 행에만 표시.
 *
 *  ── 분할 발송 정책 ──────────────────────────────────────────────────
 *  shipmentCount 는 partial_ship/ship 액션이 실행된 **총 회차 수** 를 의미.
 *  shipmentCount ≥ 2 가 "분할" 로 표시되며, 두 케이스 모두 포함:
 *    1) 수량 분할 — 한 OrderItem 의 10개 중 8개 + 2개 따로 발송
 *    2) 라인 분할 — 카트의 A품목 / B품목 을 별도 회차로 발송
 *  단일 회차 (=1) 는 일반 발송으로 간주, 표시 안 함.
 *  ────────────────────────────────────────────────────────────────────
 */
export function ShipmentSummaryChip({
  shipmentCount,
  status,
}: {
  shipmentCount: number;
  status: OrderStatus;
}) {
  if (shipmentCount < 2) return null;
  // 의미 있는 단계에서만 노출 — SHIPPED/COMPLETED/RETURN_*/RETURNED/EXCHANGED
  if (status === "PENDING" || status === "PREPARING" || status === "PREPARING_PACKED") {
    // 진행 중 행에선 행 셀의 PartialProgress 가 진행률을 보여줌. 이력 칩은 발송 종료 후 의미.
    return null;
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--jm-info-border)] bg-[var(--jm-info-bg)] px-1.5 py-px text-[10px] font-medium text-[var(--jm-info-fg)] tabular-nums"
      title={`${shipmentCount}회에 걸쳐 발송됨 — 한 품목을 여러 회차로 나누거나(수량 분할), 카트의 다른 품목을 별도 회차로 보낸 경우(라인 분할) 모두 포함`}
    >
      분할 {shipmentCount}회 발송
    </span>
  );
}

/**
 * 결제 상태 배지 — outline + 색 dot. 출고 상태와 시각 무게 분리.
 * 같은 줄에 출고 상태와 함께 노출되어도 outline 이라 가벼움.
 */
const PAYMENT_DOT: Record<OrderPaymentStatus, string> = {
  UNPAID: "bg-[var(--jm-danger-fg)]",
  PAID: "bg-[var(--jm-success-fg)]",
  REFUND_PENDING: "bg-[var(--jm-warning-fg)]",
  PARTIAL_REFUND: "bg-[var(--jm-text-subtle)]",
  REFUNDED: "bg-[var(--jm-text-subtle)]",
  SALES_CANCELLED: "bg-[var(--jm-text-subtle)]",
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
  // 반품 처리 중인 주문 — 출고예정일은 의미 없음. 단계 텍스트 표시.
  if (status === "RETURN_REQUESTED") {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">
        결정 대기
      </span>
    );
  }
  if (status === "RETURN_ACCEPTED") {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">회수 대기</span>
    );
  }
  if (status === "RETURN_COLLECTED") {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">검수 대기</span>
    );
  }
  if (status === "RETURN_INSPECTED") {
    return (
      <span className="text-[12px] text-[var(--jm-warning-fg)]">종결 대기</span>
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
 * 상태 흐름 가이드 — 출고/반품/교환 3축을 줄로 시각화.
 * 흐름별 색 통일: 출고=info(파랑), 반품=warning(노랑), 교환=accent(보라).
 */
export function StatusFlowGuide() {
  const flowSteps: Array<{ status: OrderStatus; hint?: string }> = [
    { status: "PENDING" },
    { status: "PREPARING" },
    { status: "PREPARING_PACKED" },
    { status: "SHIPPED" },
    { status: "COMPLETED" },
  ];
  const refundSteps: Array<{ status: OrderStatus; hint?: string }> = [
    { status: "RETURN_REQUESTED" },
    { status: "RETURN_ACCEPTED" },
    { status: "RETURN_COLLECTED" },
    { status: "RETURN_INSPECTED" },
    { status: "RETURNED" },
  ];
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-[11px] text-[var(--jm-text-muted)]">
      <FlowRow
        label="출고"
        steps={flowSteps}
        suffix="· 출고대기까지 취소 가능"
      />
      <FlowRow
        label="반품"
        steps={refundSteps}
        claimType="REFUND"
        suffix="· 외상은 매출취소(SALES_CANCELLED)"
      />
      <FlowRow
        label="교환"
        steps={refundSteps}
        claimType="EXCHANGE_SAME"
        suffix="· 검수 후 교환완료 + 새 주문(-EX) 자동 생성"
        terminalStatus="EXCHANGED"
      />
    </div>
  );
}

function FlowRow({
  label,
  steps,
  claimType,
  suffix,
  terminalStatus,
}: {
  label: string;
  steps: Array<{ status: OrderStatus; hint?: string }>;
  claimType?: OrderClaimType;
  suffix?: string;
  /** 기본 종결 status 와 다른 종결 (교환은 EXCHANGED) */
  terminalStatus?: OrderStatus;
}) {
  // 마지막 단계만 terminalStatus 로 치환 (교환 흐름의 종결)
  const effectiveSteps = terminalStatus
    ? [...steps.slice(0, -1), { status: terminalStatus }]
    : steps;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="w-14 font-medium text-[var(--jm-text-subtle)]">
        {label}
      </span>
      {effectiveSteps.map((s, i) => (
        <span key={`${s.status}-${i}`} className="inline-flex items-center gap-1.5">
          <StatusBadge status={s.status} claimType={claimType} />
          {s.hint && <span>{s.hint}</span>}
          {i < effectiveSteps.length - 1 && (
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
