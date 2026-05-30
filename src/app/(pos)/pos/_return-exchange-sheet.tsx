"use client";

/**
 * POS 반품·교환 진입 시트 — 등록 고객의 매장 즉석 처리용 단축 경로.
 *
 * 흐름:
 *   1) /api/customers/[id]/refundable-orders 로 환불 가능 주문 fetch
 *   2) 주문 카드 리스트 표시 — 한 행에 [반품][교환] 버튼
 *   3) [반품] → RefundDialog (workboard 와 동일 컴포넌트 재사용)
 *   4) [교환] → SAME/DIFFERENT 선택 confirm → API 직접 호출
 *
 * 매장 즉석 단축 경로라 RETURN_REQUESTED→ACCEPTED→COLLECTED→INSPECTED 단계 건너뜀.
 * 고객이 매장에 와있고 매장 직원이 직접 확인하는 흐름이므로.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  RefundDialog,
  type RefundDialogOrder,
} from "@/app/(dashboard)/orders/_refund-dialog";
import { BottomSheet } from "./_components/bottom-sheet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName: string;
}

interface RefundableOrder {
  id: string;
  orderNo: string;
  orderDate: string;
  status: "COMPLETED" | "RETURN_INSPECTED";
  paymentStatus:
    | "UNPAID"
    | "PAID"
    | "REFUND_PENDING"
    | "PARTIAL_REFUND"
    | "REFUNDED"
    | "SALES_CANCELLED";
  paymentMethod: string | null;
  totalAmount: string;
  channelOrderNo: string | null;
  channel: { name: string; code: string } | null;
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    returnedQty: string;
    refundedAmount: string;
    serviceName: string | null;
    product: { name: string } | null;
  }>;
}

export function ReturnExchangeSheet({
  open,
  onOpenChange,
  customerId,
  customerName,
}: Props) {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<RefundableOrder | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundPrefill, setRefundPrefill] = useState<Record<string, string>>({});
  const [exchangeOpen, setExchangeOpen] = useState(false);

  const ordersQuery = useQuery({
    queryKey: ["pos", "refundable-orders", customerId],
    queryFn: () =>
      apiGet<RefundableOrder[]>(`/api/customers/${customerId}/refundable-orders`),
    enabled: open && !!customerId,
  });

  // open false → state 리셋 (렌더 중 비교 패턴)
  const openKey = open ? "1" : "0";
  const [lastOpenKey, setLastOpenKey] = useState(openKey);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (!open) {
      setSelectedOrder(null);
      setRefundDialogOpen(false);
      setRefundPrefill({});
      setExchangeOpen(false);
    }
  }

  const exchangeMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      claimType: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT";
    }) =>
      apiMutate(`/api/orders/${input.orderId}`, "PUT", {
        action: "exchange",
        claimType: input.claimType,
      }),
    onSuccess: () => {
      toast.success(
        "교환 처리 완료 — 새 주문(-EX) 생성됨. 차액·항목은 워크보드에서 편집.",
      );
      qc.invalidateQueries({ queryKey: queryKeys.orders.all });
      qc.invalidateQueries({ queryKey: queryKeys.sales.all });
      qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      qc.invalidateQueries({ queryKey: ["pos", "refundable-orders", customerId] });
      setExchangeOpen(false);
      setSelectedOrder(null);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "교환 실패"),
  });

  const openRefund = (order: RefundableOrder) => {
    setSelectedOrder(order);
    const init: Record<string, string> = {};
    for (const it of order.items) {
      const remaining = Number(it.quantity) - Number(it.returnedQty);
      init[it.id] = String(remaining);
    }
    setRefundPrefill(init);
    setRefundDialogOpen(true);
  };

  const openExchange = (order: RefundableOrder) => {
    setSelectedOrder(order);
    setExchangeOpen(true);
  };

  // RefundDialog 가 요구하는 minimal shape — 그대로 매칭
  const refundOrderShape: RefundDialogOrder | null = selectedOrder
    ? {
        id: selectedOrder.id,
        paymentStatus: selectedOrder.paymentStatus,
        paymentMethod: selectedOrder.paymentMethod,
        totalAmount: selectedOrder.totalAmount,
        items: selectedOrder.items.map((it) => ({
          id: it.id,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          returnedQty: it.returnedQty,
          refundedAmount: it.refundedAmount,
          product: it.product ? { name: it.product.name } : null,
        })),
      }
    : null;

  if (!open) return null;

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`반품·교환 — ${customerName}`}
        maxHeight="92vh"
        z="elevated"
      >
        {ordersQuery.isPending ? (
          <div className="flex flex-col gap-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-[var(--jm-surface-muted)]"
              />
            ))}
          </div>
        ) : ordersQuery.isError ? (
          <div className="py-8 text-center text-jm-base text-[var(--jm-danger-fg)]">
            주문 목록을 불러오지 못했습니다
          </div>
        ) : !ordersQuery.data || ordersQuery.data.length === 0 ? (
          <div className="py-12 text-center text-jm-base text-[var(--jm-text-muted)]">
            반품·교환 가능한 주문이 없습니다
            <div className="mt-1 text-jm-xs text-[var(--jm-text-subtle)]">
              배송완료 또는 검수완료 상태의 주문만 노출됩니다
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {ordersQuery.data.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onRefund={() => openRefund(order)}
                onExchange={() => openExchange(order)}
              />
            ))}
          </div>
        )}
      </BottomSheet>

      {/* 반품 다이얼로그 — workboard 와 동일 컴포넌트 재사용 */}
      {refundOrderShape && (
        <RefundDialog
          open={refundDialogOpen}
          onOpenChange={(v) => {
            setRefundDialogOpen(v);
            if (!v) {
              setSelectedOrder(null);
              setRefundPrefill({});
            }
          }}
          order={refundOrderShape}
          initialPartialReturns={refundPrefill}
          onDone={() => {
            qc.invalidateQueries({
              queryKey: ["pos", "refundable-orders", customerId],
            });
            onOpenChange(false);
          }}
        />
      )}

      {/* 교환 SAME/DIFFERENT 미니 다이얼로그 */}
      {exchangeOpen && selectedOrder && (
        <ExchangeMiniDialog
          order={selectedOrder}
          onClose={() => {
            setExchangeOpen(false);
            setSelectedOrder(null);
          }}
          onSubmit={(claimType) =>
            exchangeMutation.mutate({ orderId: selectedOrder.id, claimType })
          }
          submitting={exchangeMutation.isPending}
        />
      )}
    </>
  );
}

function OrderCard({
  order,
  onRefund,
  onExchange,
}: {
  order: RefundableOrder;
  onRefund: () => void;
  onExchange: () => void;
}) {
  const itemSummary = order.items
    .map((it) => it.product?.name ?? it.serviceName ?? "—")
    .slice(0, 2)
    .join(", ");
  const more = order.items.length > 2 ? ` 외 ${order.items.length - 2}건` : "";
  const totalRefunded = order.items.reduce(
    (s, it) => s + Number(it.refundedAmount ?? 0),
    0,
  );
  const isPartial =
    order.paymentStatus === "PARTIAL_REFUND" || totalRefunded > 0;

  return (
    <div className="rounded-2xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-jm-sm font-semibold text-[var(--jm-text)]">
              {order.orderNo}
            </span>
            {order.channel && (
              <span className="rounded-full bg-[var(--jm-surface-muted)] px-2 py-0.5 text-jm-2xs text-[var(--jm-text-muted)]">
                {order.channel.name}
              </span>
            )}
            {isPartial && (
              <span className="rounded-full bg-[var(--jm-warning-bg)] px-2 py-0.5 text-jm-2xs text-[var(--jm-warning-fg)]">
                부분환불 진행중
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-jm-sm text-[var(--jm-text)]">
            {itemSummary}
            {more}
          </div>
          <div className="mt-0.5 text-jm-2xs text-[var(--jm-text-muted)]">
            {new Date(order.orderDate).toLocaleDateString("ko-KR")} · ₩
            {Number(order.totalAmount).toLocaleString("ko-KR")}
            {totalRefunded > 0 && (
              <>
                {" · 환불 ₩"}
                {Math.round(totalRefunded).toLocaleString("ko-KR")}
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRefund}
          className="flex-1 rounded-xl bg-[var(--jm-danger-bg)] py-2 text-jm-sm font-semibold text-[var(--jm-danger-fg)] active:opacity-80"
        >
          반품
        </button>
        <button
          type="button"
          onClick={onExchange}
          className="flex-1 rounded-xl bg-[var(--jm-action)] py-2 text-jm-sm font-semibold text-[var(--jm-action-fg)] active:opacity-80"
        >
          교환
        </button>
      </div>
    </div>
  );
}

function ExchangeMiniDialog({
  order,
  onClose,
  onSubmit,
  submitting,
}: {
  order: RefundableOrder;
  onClose: () => void;
  onSubmit: (claimType: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT") => void;
  submitting: boolean;
}) {
  const [kind, setKind] = useState<"EXCHANGE_SAME" | "EXCHANGE_DIFFERENT">(
    "EXCHANGE_SAME",
  );
  return (
    <>
      <button
        type="button"
        onClick={() => !submitting && onClose()}
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        aria-label="닫기"
      />
      <div className="fixed inset-x-4 top-1/2 z-[70] -translate-y-1/2 rounded-3xl bg-[var(--jm-surface)] p-5 shadow-2xl">
        <h3 className="text-jm-lg font-bold text-[var(--jm-text)]">
          교환 처리 — {order.orderNo}
        </h3>
        <p className="mt-1 text-jm-xs text-[var(--jm-text-muted)]">
          매장 즉석 교환. 새 주문(-EX) 이 자동 생성됩니다.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setKind("EXCHANGE_SAME")}
            disabled={submitting}
            className={`flex-1 rounded-xl border-2 p-3 text-left text-jm-xs transition-colors ${
              kind === "EXCHANGE_SAME"
                ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                : "border-[var(--jm-border)] bg-[var(--jm-surface)]"
            }`}
          >
            <div className="text-jm-base font-semibold">같은 상품</div>
            <div className="mt-0.5 text-[var(--jm-text-muted)]">
              항목 그대로 복제. 차액 0
            </div>
          </button>
          <button
            type="button"
            onClick={() => setKind("EXCHANGE_DIFFERENT")}
            disabled={submitting}
            className={`flex-1 rounded-xl border-2 p-3 text-left text-jm-xs transition-colors ${
              kind === "EXCHANGE_DIFFERENT"
                ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                : "border-[var(--jm-border)] bg-[var(--jm-surface)]"
            }`}
          >
            <div className="text-jm-base font-semibold">다른 상품</div>
            <div className="mt-0.5 text-[var(--jm-text-muted)]">
              빈 항목 + 차액. 워크보드에서 편집
            </div>
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-[var(--jm-border)] py-2.5 text-jm-sm font-semibold text-[var(--jm-text)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                !confirm(
                  kind === "EXCHANGE_SAME"
                    ? "같은 상품으로 교환합니다. 새 주문이 자동 생성됩니다."
                    : "다른 상품으로 교환합니다. 새 주문(-EX)이 생성되고 항목은 워크보드에서 편집합니다.",
                )
              )
                return;
              onSubmit(kind);
            }}
            disabled={submitting}
            className="flex-1 rounded-xl bg-[var(--jm-action)] py-2.5 text-jm-sm font-semibold text-[var(--jm-action-fg)] disabled:opacity-50"
          >
            {submitting ? "처리 중..." : "교환 확정"}
          </button>
        </div>
      </div>
    </>
  );
}
