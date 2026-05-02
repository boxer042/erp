"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Asset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string;
  status: string;
}

interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  businessNumber: string | null;
}

const PAYMENTS = [
  { value: "CASH", label: "현금" },
  { value: "CARD", label: "카드" },
  { value: "TRANSFER", label: "계좌이체" },
  { value: "UNPAID", label: "외상" },
] as const;

export default function NewRentalPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [assetId, setAssetId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickDefaultName, setQuickDefaultName] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    startDate: today,
    endDate: nextWeek,
    rateType: "DAILY" as "DAILY" | "MONTHLY",
    unitRate: "0",
    depositAmount: "0",
    paymentMethod: "CARD" as "CASH" | "CARD" | "TRANSFER" | "UNPAID",
    memo: "",
  });

  const assetsQuery = useQuery({
    queryKey: queryKeys.rentalAssets.list({ status: "AVAILABLE" }),
    queryFn: () => apiGet<Asset[]>("/api/rental-assets?status=AVAILABLE"),
  });
  const assets = assetsQuery.data ?? [];

  const customersQuery = useQuery({
    queryKey: queryKeys.customers.list(),
    queryFn: () => apiGet<CustomerLite[]>("/api/customers"),
  });
  const customers = customersQuery.data ?? [];

  useEffect(() => {
    const asset = assets.find((a) => a.id === assetId);
    if (asset) {
      setForm((f) => ({
        ...f,
        unitRate: f.rateType === "DAILY" ? String(asset.dailyRate ?? 0) : String(asset.monthlyRate ?? 0),
        depositAmount: String(asset.depositAmount ?? 0),
      }));
    }
  }, [assetId, assets]);

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!assetId || !customerId) throw new Error("자산과 고객을 선택하세요");
      return apiMutate<{ id: string; rentalNo: string }>("/api/rentals", "POST", {
        assetId,
        customerId,
        startDate: form.startDate,
        endDate: form.endDate,
        rateType: form.rateType,
        unitRate: parseFloat(parseComma(form.unitRate)) || 0,
        depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
        paymentMethod: form.paymentMethod,
        memo: form.memo,
      });
    },
    onSuccess: (data) => {
      toast.success(`임대 시작 — ${data.rentalNo}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.rentals.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.rentalAssets.all });
      router.push(`/pos/rental/${data.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "임대 시작 실패"),
  });
  const submitting = submitMutation.isPending;
  const submit = () => submitMutation.mutate();

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link href="/pos/rental" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 임대 목록
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">임대 시작</h1>

      <div className="space-y-5 rounded-xl border border-border bg-background p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">자산 *</label>
          <Select value={assetId} onValueChange={(v) => setAssetId(v ?? "")}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder="선택..." />
            </SelectTrigger>
            <SelectContent>
              {assets.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.assetNo} · {a.name}{a.brand ? ` (${a.brand})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">고객 *</label>
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={(id) => setCustomerId(id)}
            onCreateNew={(name) => {
              setQuickDefaultName(name);
              setQuickCustomerOpen(true);
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">시작일</label>
            <Input type="date" className="h-11" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">반납 예정일</label>
            <Input type="date" className="h-11" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">요율 타입</label>
            <Select value={form.rateType} onValueChange={(v) => setForm({ ...form, rateType: (v ?? "DAILY") as "DAILY" | "MONTHLY" })}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">일별</SelectItem>
                <SelectItem value="MONTHLY">월별</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">단가</label>
            <Input
              className="h-11 text-right"
              inputMode="numeric"
              value={formatComma(form.unitRate)}
              onChange={(e) => setForm({ ...form, unitRate: parseComma(e.target.value) })}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">보증금</label>
          <Input
            className="h-11 text-right"
            inputMode="numeric"
            value={formatComma(form.depositAmount)}
            onChange={(e) => setForm({ ...form, depositAmount: parseComma(e.target.value) })}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">결제수단</label>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENTS.map((p) => (
              <button
                key={p.value}
                onClick={() => setForm({ ...form, paymentMethod: p.value })}
                className={`h-10 rounded-md border text-sm font-medium ${
                  form.paymentMethod === p.value
                    ? "border-primary bg-primary/10 text-primary/80"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">메모</label>
          <Textarea rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => router.push("/pos/rental")}>취소</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            임대 시작
          </Button>
        </div>
      </div>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
          setCustomerId(c.id);
        }}
      />
    </div>
  );
}
