"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import { format } from "date-fns";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  jmToast as toast,
  JmAlert,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmContainer,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSkeleton,
  JmTextarea,
} from "@/jm";

interface PendingOrderItem {
  id: string;
  serviceName: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  order: {
    id: string;
    orderNo: string;
    orderDate: string;
    customerId: string | null;
    customerName: string | null;
  };
}

interface ReconcileFormValue {
  orderItemId: string;
  displayName: string;
  acquiredCost: string;
  sourceMemo: string;
  memo: string;
}

const EMPTY_FORM: ReconcileFormValue = {
  orderItemId: "",
  displayName: "",
  acquiredCost: "0",
  sourceMemo: "",
  memo: "",
};

export default function UsedItemReconcilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReconcileFormValue>(EMPTY_FORM);

  const pendingQuery = useQuery<PendingOrderItem[]>({
    queryKey: queryKeys.usedItems.reconcile(),
    queryFn: () => apiGet<PendingOrderItem[]>("/api/used-items/reconcile?days=30"),
  });

  const reconcileMutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/used-items/reconcile", "POST", {
        orderItemId: form.orderItemId,
        displayName: form.displayName,
        acquiredCost: form.acquiredCost || "0",
        sourceMemo: form.sourceMemo || null,
        memo: form.memo || null,
      }),
    onSuccess: () => {
      toast.success("사후 정리되었습니다");
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "사후 정리 실패"),
  });

  const select = (item: PendingOrderItem) => {
    setForm({
      orderItemId: item.id,
      displayName: item.serviceName ?? "",
      acquiredCost: "0",
      sourceMemo: "",
      memo: "",
    });
  };

  const handleSubmit = () => {
    if (!form.orderItemId) {
      toast.error("먼저 미정리 항목을 선택하세요");
      return;
    }
    if (!form.displayName.trim()) {
      toast.error("품명을 입력해주세요");
      return;
    }
    reconcileMutation.mutate();
  };

  const pending = pendingQuery.data ?? [];

  return (
    <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-6 py-3">
        <Link href="/inventory/used-items">
          <JmIconButton aria-label="뒤로">
            <ArrowLeft />
          </JmIconButton>
        </Link>
        <span className="text-jm-base font-semibold">중고 단품 사후 정리</span>
        <span className="text-jm-xs text-[var(--jm-text-muted)]">
          (EMERGENCY_USE — POS 급매 후 매입 정보 등록)
        </span>
      </div>

      <JmContainer width="default" padded={false} className="p-6">
        <JmAlert variant="info" className="mb-4">
          POS 에서 자유 라인 (productId 없는 service line) 으로 결제된 미정리
          주문 항목입니다. 매장이 매입한 중고였다면 매입 정보를 등록해 마진 리포트
          정합성을 회복하세요. 최근 30일.
        </JmAlert>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 좌: 미정리 목록 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>미정리 항목 ({pending.length})</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-2 max-h-[600px] overflow-y-auto">
              {pendingQuery.isPending ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <JmSkeleton key={i} className="h-16 w-full rounded-lg" />
                ))
              ) : pending.length === 0 ? (
                <p className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  미정리 항목이 없습니다
                </p>
              ) : (
                pending.map((item) => {
                  const selected = form.orderItemId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => select(item)}
                      className={`flex w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                        selected
                          ? "border-[var(--jm-cta)] bg-[var(--jm-cta-bg)]"
                          : "border-[var(--jm-border)] bg-[var(--jm-surface)] hover:bg-[var(--jm-surface-muted)]"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium text-[var(--jm-text)]">
                          {item.serviceName ?? "(이름 없음)"}
                        </span>
                        {selected && (
                          <Check className="size-4 text-[var(--jm-cta)]" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-jm-xs text-[var(--jm-text-muted)]">
                        <Link
                          href={`/orders?id=${item.order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-[family-name:var(--jm-font-mono)] hover:underline"
                        >
                          {item.order.orderNo}
                        </Link>
                        <span>·</span>
                        <span>{format(new Date(item.order.orderDate), "yyyy-MM-dd")}</span>
                        <span>·</span>
                        <span>{item.order.customerName ?? "비회원"}</span>
                        <span className="ml-auto tabular-nums">
                          ₩{parseFloat(item.totalPrice).toLocaleString("ko-KR")}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </JmCardContent>
          </JmCard>

          {/* 우: 등록 폼 */}
          <JmCard>
            <JmCardHeader>
              <JmCardTitle>매입 정보 등록</JmCardTitle>
            </JmCardHeader>
            <JmCardContent className="space-y-3">
              {!form.orderItemId ? (
                <p className="py-8 text-center text-jm-sm text-[var(--jm-text-muted)]">
                  좌측 목록에서 항목을 선택하세요
                </p>
              ) : (
                <>
                  <JmFormField label="품명" required>
                    <JmInput
                      value={form.displayName}
                      onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="예: 중고 엔진"
                    />
                  </JmFormField>
                  <JmFormField label="매입가">
                    <div className="flex items-center gap-2">
                      <JmInput
                        type="text"
                        inputMode="numeric"
                        value={formatComma(form.acquiredCost)}
                        onChange={(e) =>
                          setForm({ ...form, acquiredCost: parseComma(e.target.value) })
                        }
                        placeholder="0"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <span className="shrink-0 text-jm-sm text-[var(--jm-text-muted)]">
                        원
                      </span>
                    </div>
                  </JmFormField>
                  <JmFormField label="매입처 메모">
                    <JmInput
                      value={form.sourceMemo}
                      onChange={(e) => setForm({ ...form, sourceMemo: e.target.value })}
                      placeholder="(선택) 박OO 등"
                    />
                  </JmFormField>
                  <JmFormField label="메모">
                    <JmTextarea
                      value={form.memo}
                      onChange={(e) => setForm({ ...form, memo: e.target.value })}
                      placeholder="(선택) 상태·이력 등"
                      rows={2}
                    />
                  </JmFormField>
                  <div className="flex justify-end gap-2 pt-2">
                    <JmButton
                      variant="ghost"
                      onClick={() => setForm(EMPTY_FORM)}
                    >
                      취소
                    </JmButton>
                    <JmButton
                      variant="cta"
                      onClick={handleSubmit}
                      disabled={reconcileMutation.isPending}
                    >
                      {reconcileMutation.isPending && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      등록
                    </JmButton>
                  </div>
                </>
              )}
            </JmCardContent>
          </JmCard>
        </div>
      </JmContainer>
    </div>
  );
}
