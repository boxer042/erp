"use client";

/**
 * RefundDialog — 반품완료 시 환불 실내역 입력 + CustomerRefund 기록 트리거.
 *
 * 진입 조건 (parent 가 분기):
 *   - RETURN_INSPECTED → refund (3단계 흐름 종결)
 *   - COMPLETED → return (즉시반품 단축경로)
 *
 * 입력 필드 (PAID/REFUND_PENDING/PARTIAL_REFUND 만 노출):
 *   - 환불 금액 (자동 채움 — 전체=totalAmount-누적환불, 부분=수량×단가 합)
 *   - 환불 방법 (CARD_CANCEL/CASH/BANK_TRANSFER/POINTS/OTHER)
 *   - 환불 일자 (기본 오늘)
 *   - 메모 (선택)
 *
 * UNPAID 는 외상 매출 취소 안내 (실 환불 없음, 매장 ledger 자동 처리).
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import {
  JmButton,
  JmDatePicker,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmFormField,
  JmInput,
  JmSelect,
  JmSpinner,
} from "@/jm";
import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import { focusCaretEnd } from "@/jm/lib/focus";

import type { OrderPaymentStatus, OrderStatus } from "./_types";

/** cascade 취소 가능한 연결 주문(택배 발송분) 상태 — 미출고 단계만 */
const CANCELLABLE_STATUSES: OrderStatus[] = [
  "PENDING",
  "PREPARING",
  "PREPARING_PACKED",
];

export type CustomerRefundMethod =
  | "CARD_CANCEL"
  | "CASH"
  | "BANK_TRANSFER"
  | "POINTS"
  | "OTHER";

const REFUND_METHOD_OPTIONS: { value: CustomerRefundMethod; label: string }[] = [
  { value: "CARD_CANCEL", label: "카드 취소" },
  { value: "CASH", label: "현금" },
  { value: "BANK_TRANSFER", label: "계좌이체" },
  { value: "POINTS", label: "포인트" },
  { value: "OTHER", label: "기타" },
];

function derivedRefundMethod(paymentMethod: string | null | undefined): CustomerRefundMethod {
  switch (paymentMethod) {
    case "CARD":
      return "CARD_CANCEL";
    case "CASH":
      return "CASH";
    case "BANK_TRANSFER":
      return "BANK_TRANSFER";
    case "POINTS":
      return "POINTS";
    default:
      return "CARD_CANCEL";
  }
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** RefundDialog 가 사용하는 OrderDetail 의 최소 부분 — parent 의 OrderDetail 과 구조적 호환. */
export interface RefundDialogOrder {
  id: string;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: string | null;
  totalAmount: string;
  items: Array<{
    id: string;
    quantity: string;
    unitPrice: string;
    returnedQty: string;
    refundedAmount: string;
    product: { name: string } | null;
  }>;
  /** 분할 출고 — 이 주문(현장 수령분)에 묶인 택배 발송분(들). 함께 취소 cascade 용. */
  splitChildren?: Array<{
    id: string;
    orderNo: string;
    status: OrderStatus;
    totalAmount: string;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: RefundDialogOrder;
  /** 다이얼로그 진입 시 부모가 계산한 항목별 잔여 수량 prefill */
  initialPartialReturns: Record<string, string>;
  /** 성공 후 부모 sheet 닫기 등 후처리 */
  onDone?: () => void;
}

export function RefundDialog({
  open,
  onOpenChange,
  order,
  initialPartialReturns,
  onDone,
}: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialReturns, setPartialReturns] = useState<Record<string, string>>(initialPartialReturns);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<CustomerRefundMethod>("CARD_CANCEL");
  const [refundMemo, setRefundMemo] = useState("");
  const [refundedAtDate, setRefundedAtDate] = useState(todayIsoDate());
  // 분할 출고 — 연결된 택배 발송분(미출고)도 함께 취소할지 (전체 반품 시 옵션)
  const [cascadeCancel, setCascadeCancel] = useState(false);
  const cancellableChildren = (order.splitChildren ?? []).filter((c) =>
    CANCELLABLE_STATUSES.includes(c.status),
  );

  // 진입 / 모드 변경 / order 변경 시 — 환불 금액·방법·메모·일자 자동 채움 (이후 사용자 수정 가능)
  const ctxKey = `${open ? "1" : "0"}|${mode}|${order.id}`;
  const [lastCtxKey, setLastCtxKey] = useState("");
  if (ctxKey !== lastCtxKey && open) {
    setLastCtxKey(ctxKey);
    let defaultAmount = 0;
    if (mode === "full") {
      const total = Number(order.totalAmount ?? 0);
      const refundedSoFar = order.items.reduce(
        (s, it) => s + Number(it.refundedAmount ?? 0),
        0,
      );
      defaultAmount = Math.max(0, total - refundedSoFar);
      // 전체 모드 진입 시 partialReturns 도 부모 prefill 로 갱신
      setPartialReturns(initialPartialReturns);
    } else {
      for (const [itemId, qtyStr] of Object.entries(partialReturns)) {
        const q = parseFloat(qtyStr);
        if (!Number.isFinite(q) || q <= 0) continue;
        const it = order.items.find((i) => i.id === itemId);
        if (!it) continue;
        defaultAmount += q * Number(it.unitPrice);
      }
    }
    setRefundAmount(defaultAmount > 0 ? formatComma(String(defaultAmount)) : "");
    setRefundMethod(derivedRefundMethod(order.paymentMethod));
    setRefundMemo("");
    setRefundedAtDate(todayIsoDate());
  }

  // 다이얼로그 닫힐 때 — 다음 열림 시 신선한 prefill 받도록 lastCtxKey 리셋
  if (!open && lastCtxKey !== "") {
    // 무한 루프 방지 — 닫힘 상태에서만 1회 reset
    setLastCtxKey("");
    setPartialReturns(initialPartialReturns);
  }

  // 부분 반품 — partialItems + 선택적 refundInput 전송
  const partialRefundMutation = useMutation({
    mutationFn: (input: {
      partialItems: Array<{ orderItemId: string; returnQty: number }>;
      refundInput?: RefundInput;
    }) =>
      apiMutate(`/api/orders/${order.id}`, "PUT", {
        action: "refund",
        partialItems: input.partialItems,
        ...(input.refundInput ? { refundInput: input.refundInput } : {}),
      }),
    onSuccess: () => {
      toast.success("부분 반품 처리 완료 — 재고 복원·환불 일부 진행");
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onOpenChange(false);
      onDone?.();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  // 전체 환불 — refundInput 동봉. cascade 면 연결된 택배 발송분(미출고)도 함께 취소.
  const fullRefundMutation = useMutation({
    mutationFn: async (input: { refundInput?: RefundInput; cascade?: boolean }) => {
      // 1) 현장 수령분(이 주문) 전체 반품
      await apiMutate(`/api/orders/${order.id}`, "PUT", {
        action: "refund",
        ...(input.refundInput ? { refundInput: input.refundInput } : {}),
      });
      // 2) 연결된 택배 발송분 cascade 취소 — 각자 자기 금액으로 환불 기록(주문별 자체 결제)
      let cancelledCount = 0;
      if (input.cascade) {
        for (const child of cancellableChildren) {
          await apiMutate(`/api/orders/${child.id}`, "PUT", {
            action: "cancel",
            ...(input.refundInput
              ? {
                  refundInput: {
                    ...input.refundInput,
                    amount: Number(child.totalAmount),
                  },
                }
              : {}),
          });
          cancelledCount++;
        }
      }
      return { cancelledCount };
    },
    onSuccess: (res) => {
      toast.success(
        res.cancelledCount > 0
          ? `반품완료 — 재고·환불 처리 + 택배 발송분 ${res.cancelledCount}건 취소`
          : "반품완료 — 재고 복원·환불 처리",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onOpenChange(false);
      onDone?.();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "처리 실패"),
  });

  const submitting = fullRefundMutation.isPending || partialRefundMutation.isPending;
  const wasPaid =
    order.paymentStatus === "PAID" ||
    order.paymentStatus === "REFUND_PENDING" ||
    order.paymentStatus === "PARTIAL_REFUND";

  const handleSubmit = () => {
    let refundInput: RefundInput | undefined;
    if (wasPaid) {
      const amt = parseFloat(parseComma(refundAmount));
      if (!Number.isFinite(amt) || amt <= 0) {
        toast.error("환불 금액을 입력해주세요");
        return;
      }
      if (!refundedAtDate) {
        toast.error("환불 일자를 입력해주세요");
        return;
      }
      refundInput = {
        amount: amt,
        method: refundMethod,
        refundedAt: refundedAtDate,
        memo: refundMemo.trim() || undefined,
      };
    }

    if (mode === "full") {
      const willCascade = cascadeCancel && cancellableChildren.length > 0;
      if (
        !confirm(
          willCascade
            ? `전체 반품 + 연결된 택배 발송분 ${cancellableChildren.length}건 취소를 진행합니다.\n모든 항목 재고가 복원되고 환불(또는 매출취소)됩니다.`
            : "전체 반품 처리합니다. 모든 항목 재고가 복원되고 환불(또는 매출취소)됩니다.",
        )
      )
        return;
      fullRefundMutation.mutate({ refundInput, cascade: willCascade });
    } else {
      const partials: Array<{ orderItemId: string; returnQty: number }> = [];
      for (const [itemId, qtyStr] of Object.entries(partialReturns)) {
        const q = parseFloat(qtyStr);
        if (!Number.isFinite(q) || q <= 0) continue;
        partials.push({ orderItemId: itemId, returnQty: q });
      }
      if (partials.length === 0) {
        toast.error("반품 수량을 1개 이상 입력해주세요");
        return;
      }
      partialRefundMutation.mutate({ partialItems: partials, refundInput });
    }
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="md">
        <JmDialogHeader>
          <JmDialogTitle>반품완료 — 환불 처리</JmDialogTitle>
        </JmDialogHeader>
        <div className="space-y-3 px-5 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`flex-1 rounded-lg border-2 p-3 text-left text-jm-xs transition-colors ${
                mode === "full"
                  ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="text-jm-base font-medium">전체 반품</div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                주문 항목 모두 환불 (RETURNED 종결)
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("partial")}
              className={`flex-1 rounded-lg border-2 p-3 text-left text-jm-xs transition-colors ${
                mode === "partial"
                  ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="text-jm-base font-medium">부분 반품</div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                일부 항목만. 주문은 배송완료 복귀 + paymentStatus 부분환불
              </div>
            </button>
          </div>

          {mode === "partial" && (
            <div className="space-y-2">
              <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                각 항목별 반품 수량 입력. 0 은 반품 안 함. 잔여 수량 (주문수량 −
                누적반품) 까지 가능.
              </p>
              <div className="space-y-1.5">
                {order.items
                  .filter((it) => it.product)
                  .map((it) => {
                    const ordered = Number(it.quantity);
                    const already = Number(it.returnedQty);
                    const remaining = ordered - already;
                    return (
                      <div
                        key={it.id}
                        className="flex items-center gap-2 rounded border border-[var(--jm-border)] p-2"
                      >
                        <div className="flex-1 text-jm-xs">
                          <div className="text-[var(--jm-text)]">
                            {it.product?.name ?? "—"}
                          </div>
                          <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                            주문 {ordered.toLocaleString("ko-KR")} · 누적반품{" "}
                            {already.toLocaleString("ko-KR")} · 잔여{" "}
                            <span className="font-medium">
                              {remaining.toLocaleString("ko-KR")}
                            </span>
                          </div>
                        </div>
                        <JmInput
                          size="sm"
                          type="text"
                          inputMode="decimal"
                          value={partialReturns[it.id] ?? "0"}
                          onChange={(e) => {
                            const next = {
                              ...partialReturns,
                              [it.id]: e.target.value,
                            };
                            setPartialReturns(next);
                            // 수량 변경 시 환불 금액 자동 재계산 (부분 모드)
                            let sum = 0;
                            for (const [iid, qs] of Object.entries(next)) {
                              const q = parseFloat(qs);
                              if (!Number.isFinite(q) || q <= 0) continue;
                              const item = order.items.find((x) => x.id === iid);
                              if (!item) continue;
                              sum += q * Number(item.unitPrice);
                            }
                            setRefundAmount(sum > 0 ? formatComma(String(sum)) : "");
                          }}
                          onFocus={focusCaretEnd}
                          className="w-[80px] text-right"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 분할 출고 — 연결된 택배 발송분(미출고) 함께 취소 (전체 반품 시만) */}
          {mode === "full" && cancellableChildren.length > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-[var(--jm-warning-solid)]/30 bg-[var(--jm-warning-bg)] p-3">
              <input
                type="checkbox"
                checked={cascadeCancel}
                onChange={(e) => setCascadeCancel(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--jm-action)]"
              />
              <span className="text-jm-xs text-[var(--jm-text)]">
                연결된{" "}
                <span className="font-semibold">
                  택배 발송분 {cancellableChildren.length}건
                </span>
                도 함께 취소
                <span className="mt-0.5 block text-jm-2xs text-[var(--jm-text-muted)]">
                  {cancellableChildren.map((c) => c.orderNo).join(", ")} · 아직
                  미출고라 취소·환불 처리됩니다 (별도 환불 기록)
                </span>
              </span>
            </label>
          )}

          {wasPaid && (
            <div className="space-y-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-jm-xs font-semibold text-[var(--jm-text)]">
                  환불 실내역
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                  손님에게 실제 환불한 금액·방법 기록
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <JmFormField label="환불 금액">
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="numeric"
                    value={refundAmount}
                    onChange={(e) =>
                      setRefundAmount(formatComma(parseComma(e.target.value)))
                    }
                    onFocus={focusCaretEnd}
                    placeholder="0"
                  />
                </JmFormField>
                <JmFormField label="환불 방법">
                  <JmSelect
                    size="sm"
                    value={refundMethod}
                    onChange={(v) => setRefundMethod(v as CustomerRefundMethod)}
                    options={REFUND_METHOD_OPTIONS}
                  />
                </JmFormField>
                <JmFormField label="환불 일자">
                  <JmDatePicker
                    size="sm"
                    value={refundedAtDate ? new Date(refundedAtDate + "T00:00:00") : undefined}
                    onChange={(d) => setRefundedAtDate(d ? format(d, "yyyy-MM-dd") : "")}
                  />
                </JmFormField>
                <JmFormField label="메모 (선택)">
                  <JmInput
                    size="sm"
                    type="text"
                    value={refundMemo}
                    onChange={(e) => setRefundMemo(e.target.value)}
                    placeholder="예: 카드 매입 취소 완료"
                  />
                </JmFormField>
              </div>
            </div>
          )}

          {order.paymentStatus === "UNPAID" && (
            <div className="rounded-md border border-[var(--jm-border)] bg-[var(--jm-warning-bg)] p-3 text-jm-2xs text-[var(--jm-warning-fg)]">
              외상 주문 — 실 환불 없이 매출 취소 (고객 원장 잔액 자동 차감)
            </div>
          )}
        </div>
        <JmDialogFooter>
          <JmButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </JmButton>
          <JmButton onClick={handleSubmit} disabled={submitting}>
            {submitting && <JmSpinner size="sm" tone="inverted" />}
            {mode === "full" ? "전체 반품 확정" : "부분 반품 확정"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

type RefundInput = {
  amount: number;
  method: CustomerRefundMethod;
  refundedAt: string;
  memo?: string;
};
