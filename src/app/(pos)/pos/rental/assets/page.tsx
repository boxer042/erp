"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Asset {
  id: string;
  assetNo: string;
  name: string;
  brand: string | null;
  modelNo: string | null;
  serialNo: string | null;
  dailyRate: string;
  monthlyRate: string;
  depositAmount: string;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "대여가능",
  RENTED: "대여중",
  MAINTENANCE: "점검중",
  RETIRED: "폐기",
};

export default function RentalAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "", brand: "", modelNo: "", serialNo: "",
    dailyRate: "0", monthlyRate: "0", depositAmount: "0", memo: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/rental-assets");
    if (res.ok) setAssets(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) {
      toast.error("자산명 필수");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/rental-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          brand: form.brand,
          modelNo: form.modelNo,
          serialNo: form.serialNo,
          dailyRate: parseFloat(parseComma(form.dailyRate)) || 0,
          monthlyRate: parseFloat(parseComma(form.monthlyRate)) || 0,
          depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
          memo: form.memo,
        }),
      });
      if (!res.ok) throw new Error();
      setForm({ name: "", brand: "", modelNo: "", serialNo: "", dailyRate: "0", monthlyRate: "0", depositAmount: "0", memo: "" });
      load();
      toast.success("등록되었습니다");
    } catch {
      toast.error("등록 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("비활성화하시겠습니까?")) return;
    await fetch(`/api/rental-assets/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/pos/rental" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> 임대 목록
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">임대 자산</h1>

      <div className="mb-6 rounded-xl border border-border bg-background p-4">
        <div className="mb-2 text-sm font-semibold">신규 자산 등록</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <input className="input h-10" placeholder="자산명*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input h-10" placeholder="브랜드" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <input className="input h-10" placeholder="모델번호" value={form.modelNo} onChange={(e) => setForm({ ...form, modelNo: e.target.value })} />
          <input className="input h-10" placeholder="시리얼" value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">일 요율</label>
            <input className="input h-10" value={formatComma(form.dailyRate)} onChange={(e) => setForm({ ...form, dailyRate: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">월 요율</label>
            <input className="input h-10" value={formatComma(form.monthlyRate)} onChange={(e) => setForm({ ...form, monthlyRate: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">보증금</label>
            <input className="input h-10" value={formatComma(form.depositAmount)} onChange={(e) => setForm({ ...form, depositAmount: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <button
            onClick={add}
            disabled={submitting}
            className="self-end h-10 rounded-md bg-primary text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="mx-auto h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          등록된 자산이 없습니다
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="p-2">자산번호</th>
              <th className="p-2">자산명</th>
              <th className="p-2">브랜드</th>
              <th className="p-2">모델/시리얼</th>
              <th className="p-2 text-right">일 요율</th>
              <th className="p-2 text-right">월 요율</th>
              <th className="p-2 text-right">보증금</th>
              <th className="p-2">상태</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-neutral-100">
                <td className="p-2 font-mono text-xs">{a.assetNo}</td>
                <td className="p-2 font-medium">{a.name}</td>
                <td className="p-2">{a.brand ?? ""}</td>
                <td className="p-2 text-xs">{[a.modelNo, a.serialNo].filter(Boolean).join(" / ")}</td>
                <td className="p-2 text-right">₩{Number(a.dailyRate).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-right">₩{Number(a.monthlyRate).toLocaleString("ko-KR")}</td>
                <td className="p-2 text-right">₩{Number(a.depositAmount).toLocaleString("ko-KR")}</td>
                <td className="p-2">{STATUS_LABEL[a.status] ?? a.status}</td>
                <td className="p-2 text-right">
                  <button className="text-muted-foreground hover:text-red-500" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(229 229 229);
          padding: 0.5rem 0.75rem;
          font-size: 0.9rem;
          outline: none;
        }
        :global(.input:focus) { border-color: #3ecf8e; }
      `}</style>
    </div>
  );
}
