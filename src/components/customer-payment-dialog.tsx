"use client";

import { useEffect, useState } from "react";
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    if (!open || fixedCustomer || initialPayment) return;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d));
  }, [open, fixedCustomer, initialPayment]);

  const handleSubmit = async () => {
    if (!form.customerId) { toast.error("고객을 선택해주세요"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("금액을 입력해주세요"); return; }

    setSubmitting(true);
    try {
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

      const res = await fetch(url, {
        method: httpMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(typeof err?.error === "string" ? err.error : editing ? "수정 실패" : "등록 실패");
        return;
      }

      toast.success(editing ? "수금이 수정되었습니다" : "수금이 등록되었습니다");
      onOpenChange(false);
      onSaved?.();
    } catch {
      toast.error("오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm("수금 항목을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customer-payments/${initialPayment!.id}`, {
        method: "DELETE",
      });
      if (!res.ok) { toast.error("삭제 실패"); return; }
      toast.success("수금이 삭제되었습니다");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setDeleting(false);
    }
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
