"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { cn, formatComma, parseComma } from "@/lib/utils";

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
    sign: "+" | "-"; // + = 미지급 증가(debit), - = 미지급 감소(credit)
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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || (editing ? "수정 실패" : "등록 실패")),
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/suppliers/adjustments/${initialAdjustment!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("조정이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.suppliers() });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deleting = deleteMutation.isPending;
  const handleDelete = () => {
    if (!editing) return;
    if (!confirm("조정 항목을 삭제하시겠습니까?")) return;
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "조정 수정" : "조정 등록"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <label className="block text-[13px] text-muted-foreground">
              거래처<span className="text-red-400 ml-0.5">*</span>
            </label>
            {editing || fixedSupplier ? (
              <Input value={form.supplierName} disabled />
            ) : (
              <SupplierCombobox
                suppliers={suppliers}
                value={form.supplierId}
                onChange={(id, name) => setForm((f) => ({ ...f, supplierId: id, supplierName: name }))}
                onCreateNew={() => toast.info("거래처는 '거래처' 메뉴에서 등록하세요")}
                placeholder="거래처 선택..."
              />
            )}
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
            <div className="space-y-1.5">
              <label className="block text-[13px] text-muted-foreground">부호</label>
              <div className="flex h-8 rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sign: "+" }))}
                  className={cn(
                    "px-3 text-xs",
                    form.sign === "+" ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                  title="미지급 증가"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sign: "-" }))}
                  className={cn(
                    "px-3 text-xs border-l border-border",
                    form.sign === "-" ? "bg-secondary text-foreground" : "text-muted-foreground",
                  )}
                  title="미지급 감소"
                >
                  −
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] text-muted-foreground">
                금액<span className="text-red-400 ml-0.5">*</span>
              </label>
              <Input
                value={formatComma(form.amount)}
                onChange={(e) => setForm((f) => ({ ...f, amount: parseComma(e.target.value) }))}
                onFocus={(e) => e.currentTarget.select()}
                inputMode="numeric"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] text-muted-foreground">
                일자<span className="text-red-400 ml-0.5">*</span>
              </label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] text-muted-foreground">메모</label>
            <Input
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="예: 에누리, 오차 정정"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {form.sign === "+" ? "미지급금(채무) 증가 — 차변 기록" : "미지급금(채무) 감소 — 대변 기록"}
          </p>
        </div>
        <DialogFooter className="sm:justify-between">
          <div>
            {editing && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting || submitting}
                className="text-red-400 hover:text-red-300"
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                삭제
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "수정" : "등록"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
