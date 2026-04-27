"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerCombobox } from "@/components/customer-combobox";
import { cn, formatComma, parseComma } from "@/lib/utils";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  businessNumber?: string | null;
}

export interface CustomerAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fixedCustomer?: { id: string; name: string };
  initialAdjustment?: {
    id: string;
    customer: { id: string; name: string };
    amount: string; // signed amount string
    date: string;
    memo: string | null;
  };
  onSaved?: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function CustomerAdjustmentDialog({
  open,
  onOpenChange,
  fixedCustomer,
  initialAdjustment,
  onSaved,
}: CustomerAdjustmentDialogProps) {
  const editing = !!initialAdjustment;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<{
    customerId: string;
    customerName: string;
    sign: "+" | "-";
    amount: string;
    date: string;
    memo: string;
  }>({
    customerId: "",
    customerName: "",
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
        customerId: initialAdjustment.customer.id,
        customerName: initialAdjustment.customer.name,
        sign: amt >= 0 ? "+" : "-",
        amount: String(Math.abs(amt)),
        date: new Date(initialAdjustment.date).toISOString().slice(0, 10),
        memo: initialAdjustment.memo ?? "",
      });
    } else if (fixedCustomer) {
      setForm({
        customerId: fixedCustomer.id,
        customerName: fixedCustomer.name,
        sign: "+",
        amount: "",
        date: todayIso(),
        memo: "",
      });
    } else {
      setForm({
        customerId: "",
        customerName: "",
        sign: "+",
        amount: "",
        date: todayIso(),
        memo: "",
      });
    }
  }, [open, initialAdjustment, fixedCustomer]);

  useEffect(() => {
    if (!open || fixedCustomer || initialAdjustment) return;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => setCustomers(d));
  }, [open, fixedCustomer, initialAdjustment]);

  const handleSubmit = async () => {
    if (!form.customerId) { toast.error("고객을 선택해주세요"); return; }
    const abs = parseFloat(form.amount);
    if (!abs || abs <= 0) { toast.error("금액을 입력해주세요"); return; }

    const signedAmount = form.sign === "+" ? abs : -abs;

    setSubmitting(true);
    try {
      const url = editing
        ? `/api/customers/adjustments/${initialAdjustment!.id}`
        : "/api/customers/adjustments";
      const httpMethod = editing ? "PUT" : "POST";
      const body = editing
        ? {
            amount: String(signedAmount),
            date: form.date,
            memo: form.memo || undefined,
          }
        : {
            customerId: form.customerId,
            amount: String(signedAmount),
            date: form.date,
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

      toast.success(editing ? "조정이 수정되었습니다" : "조정이 등록되었습니다");
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
    if (!confirm("조정 항목을 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/adjustments/${initialAdjustment!.id}`, {
        method: "DELETE",
      });
      if (!res.ok) { toast.error("삭제 실패"); return; }
      toast.success("조정이 삭제되었습니다");
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
          <DialogTitle>{editing ? "조정 수정" : "조정 등록"}</DialogTitle>
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
                  title="미수 증가"
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
                  title="미수 감소"
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
            {form.sign === "+" ? "미수금 증가 — 차변 기록" : "미수금 감소 — 대변 기록"}
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
