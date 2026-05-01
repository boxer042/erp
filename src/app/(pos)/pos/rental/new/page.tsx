"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { CustomerCombobox } from "@/components/customer-combobox";
import { QuickCustomerSheet } from "@/components/quick-register-sheets";
import { formatComma, parseComma } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);
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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/rental-assets?status=AVAILABLE").then((r) => r.json()).then(setAssets);
    fetch("/api/customers").then((r) => r.json()).then(setCustomers);
  }, []);

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

  const submit = async () => {
    if (!assetId || !customerId) {
      toast.error("자산과 고객을 선택하세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          customerId,
          startDate: form.startDate,
          endDate: form.endDate,
          rateType: form.rateType,
          unitRate: parseFloat(parseComma(form.unitRate)) || 0,
          depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
          paymentMethod: form.paymentMethod,
          memo: form.memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "임대 시작 실패");
      toast.success(`임대 시작 — ${data.rentalNo}`);
      router.push(`/pos/rental/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "실패");
    } finally {
      setSubmitting(false);
    }
  };

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
            <input type="date" className="input h-11" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">반납 예정일</label>
            <input type="date" className="input h-11" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
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
            <input
              className="input h-11 text-right"
              value={formatComma(form.unitRate)}
              onChange={(e) => setForm({ ...form, unitRate: parseComma(e.target.value) })}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">보증금</label>
          <input
            className="input h-11 text-right"
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
          <textarea className="input" rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/pos/rental" className="flex h-11 items-center rounded-lg border border-border px-4 text-sm hover:bg-muted/50">
            취소
          </Link>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            임대 시작
          </button>
        </div>
      </div>

      <QuickCustomerSheet
        open={quickCustomerOpen}
        onOpenChange={setQuickCustomerOpen}
        defaultName={quickDefaultName}
        onCreated={(c) => {
          fetch("/api/customers").then((r) => r.json()).then((list) => {
            setCustomers(list);
            setCustomerId(c.id);
          });
        }}
      />

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          font-size: 0.95rem;
          outline: none;
          background: var(--background);
          color: var(--foreground);
        }
        :global(.input:focus) { border-color: var(--primary); }
      `}</style>
    </div>
  );
}
