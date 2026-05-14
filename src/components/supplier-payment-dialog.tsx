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
import { SupplierCombobox } from "@/components/supplier-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  SUPPLIER_PAYMENT_METHODS,
  type PaymentMethod,
} from "@/lib/validators/supplier";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

export interface SupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 거래처 고정 모드 (거래처 상세 탭에서 사용). 생략하면 Dialog 안에서 거래처 선택 */
  fixedSupplier?: { id: string; name: string };
  /** 수정 모드일 때 제공 */
  initialPayment?: {
    id: string;
    supplier: { id: string; name: string };
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

export function SupplierPaymentDialog({
  open,
  onOpenChange,
  fixedSupplier,
  initialPayment,
  onSaved,
}: SupplierPaymentDialogProps) {
  const editing = !!initialPayment;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    supplierId: string;
    supplierName: string;
    amount: string;
    paymentDate: string;
    method: PaymentMethod;
    memo: string;
  }>({
    supplierId: "",
    supplierName: "",
    amount: "",
    paymentDate: todayIso(),
    method: "TRANSFER",
    memo: "",
  });

  useEffect(() => {
    if (!open) return;
    if (initialPayment) {
      setForm({
        supplierId: initialPayment.supplier.id,
        supplierName: initialPayment.supplier.name,
        amount: initialPayment.amount,
        paymentDate: new Date(initialPayment.paymentDate).toISOString().slice(0, 10),
        method: initialPayment.method,
        memo: initialPayment.memo ?? "",
      });
    } else if (fixedSupplier) {
      setForm({
        supplierId: fixedSupplier.id,
        supplierName: fixedSupplier.name,
        amount: "",
        paymentDate: todayIso(),
        method: "TRANSFER",
        memo: "",
      });
    } else {
      setForm({
        supplierId: "",
        supplierName: "",
        amount: "",
        paymentDate: todayIso(),
        method: "TRANSFER",
        memo: "",
      });
    }
  }, [open, initialPayment, fixedSupplier]);

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
    enabled: open && !fixedSupplier && !initialPayment,
  });
  const suppliers = suppliersQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/supplier-payments/${initialPayment!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("결제가 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.suppliers() });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deleting = deleteMutation.isPending;
  const handleDelete = () => {
    if (!editing) return;
    if (!confirm("결제 항목을 삭제하시겠습니까?")) return;
    deleteMutation.mutate();
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!form.supplierId) throw new Error("거래처를 선택해주세요");
      if (!form.amount || parseFloat(form.amount) <= 0) throw new Error("금액을 입력해주세요");
      const url = editing
        ? `/api/supplier-payments/${initialPayment!.id}`
        : "/api/supplier-payments";
      const httpMethod = editing ? "PUT" : "POST";
      const body = editing
        ? {
            amount: form.amount,
            paymentDate: form.paymentDate,
            method: form.method,
            memo: form.memo || undefined,
          }
        : {
            supplierId: form.supplierId,
            amount: form.amount,
            paymentDate: form.paymentDate,
            method: form.method,
            memo: form.memo || undefined,
          };
      return apiMutate(url, httpMethod, body);
    },
    onSuccess: () => {
      toast.success(editing ? "결제가 수정되었습니다" : "결제가 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.suppliers() });
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

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="lg">
        <JmDialogHeader>
          <JmDialogTitle>{editing ? "결제 수정" : "결제 등록"}</JmDialogTitle>
        </JmDialogHeader>

        <JmDialogBody>
          <div className="space-y-4 text-jm-sm">
            {/* 거래처 */}
            <Field label="거래처" required>
              {editing || fixedSupplier ? (
                <JmInput size="sm" value={form.supplierName} disabled />
              ) : (
                <SupplierCombobox
                  suppliers={suppliers}
                  value={form.supplierId}
                  onChange={(id, name) =>
                    setForm((f) => ({ ...f, supplierId: id, supplierName: name }))
                  }
                  onCreateNew={() => toast.info("거래처는 '거래처' 메뉴에서 등록하세요")}
                  placeholder="거래처 선택..."
                />
              )}
            </Field>

            {/* 금액 + 결제일 — 모두 sm 통일 */}
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
              <Field label="결제일" required>
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

            {/* 결제 방식 */}
            <Field label="결제 방식" required>
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
                placeholder="선택 — 송금 메모, 영수증 번호 등"
              />
            </Field>

            {/* 안내 */}
            <p className="text-jm-2xs text-[var(--jm-text-muted)]">
              결제 등록 시 거래처 미지급금이 차감됩니다 (대변 기록).
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

