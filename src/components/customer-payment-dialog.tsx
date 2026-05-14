"use client";
/* eslint-disable react-hooks/set-state-in-effect -- dialog open 토글 시 props 기반 form 초기화 (의도된 패턴) */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmButton,
  JmDatePicker,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
  JmSelect,
} from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { CustomerCombobox } from "@/components/customer-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  SUPPLIER_PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validators/supplier";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}

export interface CustomerPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedCustomer?: { id: string; name: string };
  initialPayment?: {
    id: string;
    customer: { id: string; name: string };
    amount: string;
    paymentDate: string;
    method: PaymentMethod;
    memo: string | null;
  };
  onSaved?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const METHOD_OPTIONS = SUPPLIER_PAYMENT_METHODS.map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABELS[m],
}));

export function CustomerPaymentDialog({
  open,
  onOpenChange,
  fixedCustomer,
  initialPayment,
  onSaved,
}: CustomerPaymentDialogProps) {
  const editing = !!initialPayment;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    customerId: string;
    customerName: string;
    amount: string;
    paymentDate: string;
    method: PaymentMethod;
    memo: string;
  }>({
    customerId: "",
    customerName: "",
    amount: "",
    paymentDate: todayIso(),
    method: "TRANSFER",
    memo: "",
  });

  useEffect(() => {
    if (!open) return;
    if (initialPayment) {
      setForm({
        customerId: initialPayment.customer.id,
        customerName: initialPayment.customer.name,
        amount: initialPayment.amount,
        paymentDate: new Date(initialPayment.paymentDate).toISOString().slice(0, 10),
        method: initialPayment.method,
        memo: initialPayment.memo ?? "",
      });
    } else if (fixedCustomer) {
      setForm({
        customerId: fixedCustomer.id,
        customerName: fixedCustomer.name,
        amount: "",
        paymentDate: todayIso(),
        method: "TRANSFER",
        memo: "",
      });
    } else {
      setForm({
        customerId: "",
        customerName: "",
        amount: "",
        paymentDate: todayIso(),
        method: "TRANSFER",
        memo: "",
      });
    }
  }, [open, initialPayment, fixedCustomer]);

  const customersQuery = useQuery({
    queryKey: queryKeys.customers.list(),
    queryFn: () => apiGet<Customer[]>("/api/customers"),
    enabled: open && !fixedCustomer && !initialPayment,
  });
  const customers = customersQuery.data ?? [];

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!form.customerId) throw new Error("고객을 선택해주세요");
      if (!form.amount || parseFloat(form.amount) <= 0) throw new Error("금액을 입력해주세요");
      const url = editing
        ? `/api/customer-payments/${initialPayment!.id}`
        : "/api/customer-payments";
      const httpMethod = editing ? "PUT" : "POST";
      const body = editing
        ? {
            amount: form.amount,
            paymentDate: form.paymentDate,
            method: form.method,
            memo: form.memo || undefined,
          }
        : {
            customerId: form.customerId,
            amount: form.amount,
            paymentDate: form.paymentDate,
            method: form.method,
            memo: form.memo || undefined,
          };
      return apiMutate(url, httpMethod, body);
    },
    onSuccess: () => {
      toast.success(editing ? "수금이 수정되었습니다" : "수금이 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.customers() });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : err.message || (editing ? "수정 실패" : "등록 실패"),
      ),
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/customer-payments/${initialPayment!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("수금이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.customers() });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deleting = deleteMutation.isPending;
  const handleDelete = () => {
    if (!editing) return;
    if (!confirm("수금 항목을 삭제하시겠습니까?")) return;
    deleteMutation.mutate();
  };

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="lg">
        <JmDialogHeader>
          <JmDialogTitle>{editing ? "수금 수정" : "수금 등록"}</JmDialogTitle>
        </JmDialogHeader>

        <JmDialogBody>
          <div className="space-y-4 text-jm-sm">
            {/* 고객 */}
            <Field label="고객" required>
              {editing || fixedCustomer ? (
                <JmInput size="sm" value={form.customerName} disabled />
              ) : (
                <CustomerCombobox
                  customers={customers}
                  value={form.customerId}
                  onChange={(id, c) =>
                    setForm((f) => ({ ...f, customerId: id, customerName: c.name }))
                  }
                  onCreateNew={() => toast.info("고객은 '고객' 메뉴에서 등록하세요")}
                  placeholder="고객 선택..."
                />
              )}
            </Field>

            {/* 금액 + 수금일 */}
            <div className="grid grid-cols-[1fr_180px] gap-3">
              <Field label="금액 (VAT 포함)" required>
                <JmInput
                  size="sm"
                  value={formatComma(form.amount)}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: parseComma(e.target.value) }))
                  }
                  onFocus={focusCaretEnd}
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus
                  className="text-right tabular-nums font-semibold"
                />
              </Field>
              <Field label="수금일" required>
                <JmDatePicker
                  size="sm"
                  value={form.paymentDate ? new Date(form.paymentDate + "T00:00:00") : undefined}
                  onChange={(d) =>
                    setForm((f) => ({
                      ...f,
                      paymentDate: d
                        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                        : "",
                    }))
                  }
                />
              </Field>
            </div>

            {/* 수금 방식 */}
            <Field label="수금 방식" required>
              <JmSelect
                size="sm"
                options={METHOD_OPTIONS}
                value={form.method}
                onChange={(v) => setForm((f) => ({ ...f, method: v as PaymentMethod }))}
              />
            </Field>

            {/* 메모 */}
            <Field label="메모">
              <JmInput
                size="sm"
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                onFocus={focusCaretEnd}
                placeholder="선택 — 입금 메모, 영수증 번호 등"
              />
            </Field>

            {/* 안내 */}
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              수금 등록 시 고객 미수금이 차감됩니다 (대변 기록).
            </p>
          </div>
        </JmDialogBody>

        <JmDialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {editing && (
                <JmButton
                  variant="danger"
                  onClick={handleDelete}
                  disabled={deleting || submitting}
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  삭제
                </JmButton>
              )}
            </div>
            <div className="flex gap-2">
              <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
                취소
              </JmButton>
              <JmButton variant="cta" onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                <span>{editing ? "수정" : "등록"}</span>
              </JmButton>
            </div>
          </div>
        </JmDialogFooter>
      </JmDialogContent>
    </JmDialog>
  );
}

// ─── Field wrapper — label + 컨트롤 ────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-jm-xs font-medium text-[var(--jm-text-muted)]">
        {label}
        {required && <span className="text-[var(--jm-danger-fg)] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
