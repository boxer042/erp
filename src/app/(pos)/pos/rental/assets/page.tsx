"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { formatComma, parseComma } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

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
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "", brand: "", modelNo: "", serialNo: "",
    dailyRate: "0", monthlyRate: "0", depositAmount: "0", memo: "",
  });

  const assetsQuery = useQuery({
    queryKey: queryKeys.rentalAssets.list(),
    queryFn: () => apiGet<Asset[]>("/api/rental-assets"),
  });
  const assets = assetsQuery.data ?? [];
  const loading = assetsQuery.isPending;
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.rentalAssets.all });

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error("자산명 필수");
      return apiMutate("/api/rental-assets", "POST", {
        name: form.name,
        brand: form.brand,
        modelNo: form.modelNo,
        serialNo: form.serialNo,
        dailyRate: parseFloat(parseComma(form.dailyRate)) || 0,
        monthlyRate: parseFloat(parseComma(form.monthlyRate)) || 0,
        depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
        memo: form.memo,
      });
    },
    onSuccess: () => {
      setForm({ name: "", brand: "", modelNo: "", serialNo: "", dailyRate: "0", monthlyRate: "0", depositAmount: "0", memo: "" });
      refresh();
      toast.success("등록되었습니다");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "등록 실패"),
  });
  const submitting = addMutation.isPending;
  const add = () => addMutation.mutate();

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/rental-assets/${id}`, "DELETE"),
    onSuccess: () => refresh(),
  });
  const remove = (id: string) => {
    if (!confirm("비활성화하시겠습니까?")) return;
    removeMutation.mutate(id);
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
          <Input className="h-10" placeholder="자산명*" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input className="h-10" placeholder="브랜드" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          <Input className="h-10" placeholder="모델번호" value={form.modelNo} onChange={(e) => setForm({ ...form, modelNo: e.target.value })} />
          <Input className="h-10" placeholder="시리얼" value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">일 요율</label>
            <Input className="h-10" inputMode="numeric" value={formatComma(form.dailyRate)} onChange={(e) => setForm({ ...form, dailyRate: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">월 요율</label>
            <Input className="h-10" inputMode="numeric" value={formatComma(form.monthlyRate)} onChange={(e) => setForm({ ...form, monthlyRate: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">보증금</label>
            <Input className="h-10" inputMode="numeric" value={formatComma(form.depositAmount)} onChange={(e) => setForm({ ...form, depositAmount: parseComma(e.target.value) })} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <Button onClick={add} disabled={submitting} className="self-end h-10">
            <Plus className="h-4 w-4" />
          </Button>
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
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>자산번호</TableHead>
              <TableHead>자산명</TableHead>
              <TableHead>브랜드</TableHead>
              <TableHead>모델/시리얼</TableHead>
              <TableHead className="text-right">일 요율</TableHead>
              <TableHead className="text-right">월 요율</TableHead>
              <TableHead className="text-right">보증금</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.assetNo}</TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell>{a.brand ?? ""}</TableCell>
                <TableCell className="text-xs">{[a.modelNo, a.serialNo].filter(Boolean).join(" / ")}</TableCell>
                <TableCell className="text-right">₩{Number(a.dailyRate).toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right">₩{Number(a.monthlyRate).toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right">₩{Number(a.depositAmount).toLocaleString("ko-KR")}</TableCell>
                <TableCell>{STATUS_LABEL[a.status] ?? a.status}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(a.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

    </div>
  );
}
