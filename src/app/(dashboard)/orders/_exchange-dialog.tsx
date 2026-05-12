"use client";

/**
 * ExchangeDialog — 교환 처리 (SAME/DIFFERENT 분기 + 전체/부분 분기).
 *
 * 진입 조건 (parent 가 분기):
 *   - RETURN_INSPECTED → exchange (3단계 흐름 종결)
 *   - claimType 이 EXCHANGE_DIFFERENT 면 default DIFFERENT, 아니면 SAME
 *
 * 액션 결과:
 *   - EXCHANGE_SAME: 원본 항목 그대로 새 주문(-EX) 복제. 차액 0, paymentStatus=PAID
 *   - EXCHANGE_DIFFERENT: 빈 항목 새 주문(-EX). 사용자가 항목·차액 직접 편집
 *   - 부분 교환: 회수된 항목만 새 주문에 복제 (EXCHANGE_SAME 한정 의미)
 *
 * 운임 책임 안내: claimReason 기반 shop/customer/shared 분류 표시.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  JmBadge,
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
  JmSpinner,
} from "@/jm";
import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

import {
  CLAIM_REASON_LABELS,
  CLAIM_REASON_LIABILITY,
  CLAIM_TYPE_LABELS,
  LIABILITY_LABELS,
  liabilityShippingNote,
  type OrderClaimReason,
  type OrderClaimType,
} from "./_types";

export interface ExchangeDialogOrder {
  id: string;
  claimType: OrderClaimType | null;
  claimReason: OrderClaimReason | null;
  items: Array<{
    id: string;
    quantity: string;
    returnedQty: string;
    product: { name: string } | null;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: ExchangeDialogOrder;
  /** 다이얼로그 진입 시 부모가 계산한 항목별 잔여 수량 prefill */
  initialPartialReturns: Record<string, string>;
  /** 성공 후 부모 sheet 닫기 등 후처리 */
  onDone?: () => void;
}

export function ExchangeDialog({
  open,
  onOpenChange,
  order,
  initialPartialReturns,
  onDone,
}: Props) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"EXCHANGE_SAME" | "EXCHANGE_DIFFERENT">(
    order.claimType === "EXCHANGE_DIFFERENT"
      ? "EXCHANGE_DIFFERENT"
      : "EXCHANGE_SAME",
  );
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialReturns, setPartialReturns] = useState<Record<string, string>>(
    initialPartialReturns,
  );

  // 다이얼로그 진입 / order 변경 시 — 기본값 재설정 (이후 사용자 수정 가능)
  const ctxKey = `${open ? "1" : "0"}|${order.id}`;
  const [lastCtxKey, setLastCtxKey] = useState("");
  if (ctxKey !== lastCtxKey && open) {
    setLastCtxKey(ctxKey);
    setKind(
      order.claimType === "EXCHANGE_DIFFERENT"
        ? "EXCHANGE_DIFFERENT"
        : "EXCHANGE_SAME",
    );
    setMode("full");
    setPartialReturns(initialPartialReturns);
  }

  // 닫힐 때 — 다음 열림 시 신선한 prefill
  if (!open && lastCtxKey !== "") {
    setLastCtxKey("");
  }

  const mutation = useMutation({
    mutationFn: (input: {
      kind: "EXCHANGE_SAME" | "EXCHANGE_DIFFERENT";
      partialItems?: Array<{ orderItemId: string; returnQty: number }>;
    }) =>
      apiMutate(`/api/orders/${order.id}`, "PUT", {
        action: "exchange",
        claimType: input.kind,
        ...(input.partialItems && input.partialItems.length > 0
          ? { partialItems: input.partialItems }
          : {}),
      }),
    onSuccess: () => {
      toast.success(
        "교환 처리 완료 — 새 주문이 생성되었습니다. 차액·항목은 새 주문에서 편집하세요.",
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

  const handleSubmit = () => {
    if (mode === "full") {
      mutation.mutate({ kind });
    } else {
      const partialItems: Array<{ orderItemId: string; returnQty: number }> = [];
      for (const [itemId, qtyStr] of Object.entries(partialReturns)) {
        const q = parseFloat(qtyStr);
        if (!Number.isFinite(q) || q <= 0) continue;
        partialItems.push({ orderItemId: itemId, returnQty: q });
      }
      if (partialItems.length === 0) {
        toast.error("교환 수량을 1개 이상 입력해주세요");
        return;
      }
      mutation.mutate({ kind, partialItems });
    }
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="md">
        <JmDialogHeader>
          <JmDialogTitle>교환 처리</JmDialogTitle>
        </JmDialogHeader>
        <div className="space-y-3 px-5 py-4">
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            회수 완료 시 새 주문이 자동 생성됩니다. 차액·항목은 새 주문에서
            편집하세요.
          </p>

          {/* 운임 책임 안내 — claimReason 기반 자동 권장 */}
          {order.claimReason &&
            (() => {
              const reason = order.claimReason;
              const liability = CLAIM_REASON_LIABILITY[reason];
              const note = liabilityShippingNote(reason);
              return (
                <div className="flex items-start gap-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] p-2.5 text-jm-xs">
                  <JmBadge
                    variant={liability === "shop" ? "warning" : "outline"}
                    size="sm"
                    shape="square"
                  >
                    {CLAIM_REASON_LABELS[reason]} · 운임{" "}
                    {LIABILITY_LABELS[liability]}
                  </JmBadge>
                  <span className="text-[var(--jm-text-muted)] leading-relaxed">
                    {note}
                  </span>
                </div>
              );
            })()}

          <div className="space-y-2">
            {(["EXCHANGE_SAME", "EXCHANGE_DIFFERENT"] as const).map((k) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex w-full flex-col gap-0.5 rounded-xl border-2 p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                      : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
                  }`}
                >
                  <span className="text-jm-base font-medium text-[var(--jm-text)]">
                    {CLAIM_TYPE_LABELS[k]}
                  </span>
                  <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                    {k === "EXCHANGE_SAME"
                      ? "원래 주문 항목 그대로 새 주문에 복제 (차액 없음, 매출 0)"
                      : "새 주문은 빈 항목으로 생성 — 항목·차액 직접 등록"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 전체/부분 토글 */}
          <div className="flex gap-2 border-t border-[var(--jm-border)] pt-3">
            <button
              type="button"
              onClick={() => setMode("full")}
              className={`flex-1 rounded-lg border-2 p-2.5 text-left text-jm-xs transition-colors ${
                mode === "full"
                  ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="text-jm-sm font-medium">전체 교환</div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                주문 항목 모두 교환 (EXCHANGED 종결)
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("partial")}
              className={`flex-1 rounded-lg border-2 p-2.5 text-left text-jm-xs transition-colors ${
                mode === "partial"
                  ? "border-[var(--jm-action)] bg-[var(--jm-surface-muted)]"
                  : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:border-[var(--jm-border-strong)]"
              }`}
            >
              <div className="text-jm-sm font-medium">부분 교환</div>
              <div className="text-jm-2xs text-[var(--jm-text-muted)]">
                일부 항목만. 원본은 배송완료 복귀
              </div>
            </button>
          </div>

          {mode === "partial" && (
            <div className="space-y-1.5">
              <p className="text-jm-2xs text-[var(--jm-text-muted)]">
                각 항목별 교환 수량 입력 (잔여 = 주문수량 − 누적반품)
              </p>
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
                          잔여{" "}
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
                        onChange={(e) =>
                          setPartialReturns({
                            ...partialReturns,
                            [it.id]: e.target.value,
                          })
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-[80px] text-right"
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </div>
        <JmDialogFooter>
          <JmButton
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            취소
          </JmButton>
          <JmButton onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <JmSpinner size="sm" tone="inverted" />}
            {mode === "full" ? "전체 교환 확정" : "부분 교환 확정"}
          </JmButton>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}
