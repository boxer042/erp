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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SupplierCombobox } from "@/components/supplier-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import {
  SUPPLIER_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || (editing ? "수정 실패" : "등록 실패")),
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "결제 수정" : "결제 등록"}</DialogTitle>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[13px] text-muted-foreground">
                금액 (VAT 포함)<span className="text-red-400 ml-0.5">*</span>
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
                결제일<span className="text-red-400 ml-0.5">*</span>
              </label>
              <Input
                type="date"
                value={form.paymentDate}
                onChange={(e) => setForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] text-muted-foreground">
              결제 방식<span className="text-red-400 ml-0.5">*</span>
            </label>
            <Select
              value={form.method}
              onValueChange={(v) => setForm((f) => ({ ...f, method: (v ?? "TRANSFER") as PaymentMethod }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v: unknown) =>
                    typeof v === "string" && v in PAYMENT_METHOD_LABELS
                      ? PAYMENT_METHOD_LABELS[v as PaymentMethod]
                      : ""
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SUPPLIER_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[13px] text-muted-foreground">메모</label>
            <Input
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="선택"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editing ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
