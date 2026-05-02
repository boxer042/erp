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
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerCombobox } from "@/components/customer-combobox";
import { formatComma, parseComma } from "@/lib/utils";
import {
  SUPPLIER_PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
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
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || (editing ? "수정 실패" : "등록 실패")),
  });
  const submitting = submitMutation.isPending;
  const handleSubmit = () => submitMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/customer-payments/${initialPayment!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("수금이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.ledger.customers() });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const deleting = deleteMutation.isPending;
  const handleDelete = () => {
    if (!editing) return;
    if (!confirm("수금 항목을 삭제하시겠습니까?")) return;
    deleteMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "수금 수정" : "수금 등록"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <label className="block text-[13px] text-muted-foreground">
              고객<span className="text-red-400 ml-0.5">*</span>
            </label>
            {editing || fixedCustomer ? (
              <Input value={form.customerName} disabled />
            ) : (
              <CustomerCombobox
                customers={customers}
                value={form.customerId}
                onChange={(id, c) => setForm((f) => ({ ...f, customerId: id, customerName: c.name }))}
                onCreateNew={() => toast.info("고객은 '고객' 메뉴에서 등록하세요")}
                placeholder="고객 선택..."
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
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
                수금일<span className="text-red-400 ml-0.5">*</span>
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
              수금 방식<span className="text-red-400 ml-0.5">*</span>
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
