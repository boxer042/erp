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
  JmSegmentedControl,
} from "@/jm";
import { focusCaretEnd } from "@/jm/lib/focus";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { formatComma, parseComma } from "@/lib/utils";

interface Supplier {
  id: string;
  name: string;
  businessNumber?: string | null;
}

export interface SupplierAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedSupplier?: { id: string; name: string };
  /** 수정 모드일 때 제공 — amount는 부호 포함 (debit 양수, credit 음수) */
  initialAdjustment?: {
    id: string;
    supplier: { id: string; name: string };
    amount: string; // signed amount string
    date: string;
    memo: string | null;
  };
  onSaved?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Sign = "+" | "-";

export function SupplierAdjustmentDialog({
  open,
  onOpenChange,
  fixedSupplier,
  initialAdjustment,
  onSaved,
}: SupplierAdjustmentDialogProps) {
  const editing = !!initialAdjustment;
  const queryClient = useQueryClient();

  const [form, setForm] = useState<{
    supplierId: string;
    supplierName: string;
    sign: Sign;
    amount: string; // unsigned digits
    date: string;
    memo: string;
  }>({
    supplierId: "",
    supplierName: "",
    sign: "+",
    amount: "",
    date: todayIso(),
    memo: "",
  });

  useEffect(() => {
    if (!open) return;
    if (initialAdjustment) {
      const amt = parseFloat(initialAdjustment.amount);
      setForm({
        supplierId: initialAdjustment.supplier.id,
        supplierName: initialAdjustment.supplier.name,
        sign: amt >= 0 ? "+" : "-",
        amount: String(Math.abs(amt)),
        date: new Date(initialAdjustment.date).toISOString().slice(0, 10),
        memo: initialAdjustment.memo ?? "",
      });
    } else if (fixedSupplier) {
      setForm({
        supplierId: fixedSupplier.id,
        supplierName: fixedSupplier.name,
        sign: "+",
        amount: "",
        date: todayIso(),
        memo: "",
      });
    } else {
      setForm({
        supplierId: "",
        supplierName: "",
        sign: "+",
        amount: "",
        date: todayIso(),
        memo: "",
      });
    }
  }, [open, initialAdjustment, fixedSupplier]);

  const suppliersQuery = useQuery({
    queryKey: queryKeys.suppliers.list(),
    queryFn: () => apiGet<Supplier[]>("/api/suppliers"),
    enabled: open && !fixedSupplier && !initialAdjustment,
  });
  const suppliers = suppliersQuery.data ?? [];

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!form.supplierId) throw new Error("거래처를 선택해주세요");
      const abs = parseFloat(form.amount);
      if (!abs || abs <= 0) throw new Error("금액을 입력해주세요");
      const signedAmount = form.sign === "+" ? abs : -abs;
      const url = editing
        ? `/api/suppliers/adjustments/${initialAdjustment!.id}`
        : "/api/suppliers/adjustments";
      const httpMethod = editing ? "PUT" : "POST";
      const body = editing
        ? {
            amount: String(signedAmount),
            date: form.date,
            memo: form.memo || undefined,
          }
        : {
            supplierId: form.supplierId,
            amount: String(signedAmount),
            date: form.date,
            memo: form.memo || undefined,
          };
      return apiMutate(url, httpMethod, body);
    },
    onSuccess: () => {
      toast.success(editing ? "조정이 수정되었습니다" : "조정이 등록되었습니다");
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

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/suppliers/adjustments/${initialAdjustment!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("조정이 삭제되었습니다");
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
    if (!confirm("조정 항목을 삭제하시겠습니까?")) return;
    deleteMutation.mutate();
  };

  const isIncrease = form.sign === "+";

  return (
    <JmDialog open={open} onOpenChange={onOpenChange}>
      <JmDialogContent size="lg">
        <JmDialogHeader>
          <JmDialogTitle>{editing ? "조정 수정" : "조정 등록"}</JmDialogTitle>
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

            {/* 조정 종류 — 명확한 라벨. 다른 인풋과 같은 h-9 통일 */}
            <Field label="조정 종류" required>
              <JmSegmentedControl
                size="sm"
                fullWidth
                ariaLabel="조정 종류"
                value={form.sign}
                onChange={(v) => setForm((f) => ({ ...f, sign: v as Sign }))}
                options={[
                  { value: "+", label: "미지급 증가 (+)" },
                  { value: "-", label: "미지급 감소 (−)" },
                ]}
              />
            </Field>

            {/* 금액 + 일자 — 모두 sm 통일 */}
            <div className="grid grid-cols-[1fr_180px] gap-3">
              <Field label="금액" required>
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
              <Field label="일자" required>
                <JmDatePicker
                  size="sm"
                  value={form.date ? new Date(form.date + "T00:00:00") : undefined}
                  onChange={(d) =>
                    setForm((f) => ({
                      ...f,
                      date: d
                        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                        : "",
                    }))
                  }
                />
              </Field>
            </div>

            {/* 메모 */}
            <Field label="메모">
              <JmInput
                size="sm"
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                onFocus={focusCaretEnd}
                placeholder={
                  isIncrease
                    ? "예: 누락된 매입 보정, 에누리 취소"
                    : "예: 에누리, 잘못 청구된 금액 정정"
                }
              />
            </Field>

            {/* 안내 — 의미 명확화 */}
            <div
              className={`rounded-lg border px-3 py-2 text-jm-xs ${
                isIncrease
                  ? "border-[var(--jm-warning-fg)]/30 bg-[var(--jm-warning-bg)] text-[var(--jm-warning-fg)]"
                  : "border-[var(--jm-success-fg)]/30 bg-[var(--jm-success-bg)] text-[var(--jm-success-fg)]"
              }`}
            >
              {isIncrease ? (
                <>
                  <strong>미지급금이 늘어납니다</strong> — 차변에 기록되어 거래처에
                  갚을 돈이 증가합니다.
                </>
              ) : (
                <>
                  <strong>미지급금이 줄어듭니다</strong> — 대변에 기록되어 거래처에
                  갚을 돈이 감소합니다.
                </>
              )}
            </div>
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

// ─── Field wrapper ─────────────────────────────────────────────────────────

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

