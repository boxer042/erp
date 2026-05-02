"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { formatComma, parseComma } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function RentalAssetsSkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-4 w-16" /></div></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

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
  memo: string | null;
  acquiredAt: string | null;
}

type AssetStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RETIRED";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "대여가능",
  RENTED: "대여중",
  MAINTENANCE: "점검중",
  RETIRED: "폐기",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive" | "warning" | "success"> = {
  AVAILABLE: "success",
  RENTED: "secondary",
  MAINTENANCE: "warning",
  RETIRED: "destructive",
};

const emptyForm = {
  name: "",
  brand: "",
  modelNo: "",
  serialNo: "",
  dailyRate: "0",
  monthlyRate: "0",
  depositAmount: "0",
  memo: "",
  status: "AVAILABLE" as AssetStatus,
  acquiredAt: "",
};

export default function RentalAssetsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState(emptyForm);

  const assetsQuery = useQuery({
    queryKey: queryKeys.rentalAssets.list(),
    queryFn: () => apiGet<Asset[]>("/api/rental-assets"),
  });
  const loading = assetsQuery.isPending;
  const assets = useMemo(() => {
    const data = assetsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.brand ?? "").toLowerCase().includes(q) ||
      (a.assetNo ?? "").toLowerCase().includes(q)
    );
  }, [assetsQuery.data, search]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.rentalAssets.all });

  const openCreate = () => {
    setEditAsset(null);
    setForm(emptyForm);
    setSheet(true);
  };

  const openEdit = (a: Asset) => {
    setEditAsset(a);
    setForm({
      name: a.name,
      brand: a.brand ?? "",
      modelNo: a.modelNo ?? "",
      serialNo: a.serialNo ?? "",
      dailyRate: String(a.dailyRate),
      monthlyRate: String(a.monthlyRate),
      depositAmount: String(a.depositAmount),
      memo: a.memo ?? "",
      status: a.status as AssetStatus,
      acquiredAt: a.acquiredAt ? a.acquiredAt.slice(0, 10) : "",
    });
    setSheet(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error("자산명을 입력하세요");
      const body = {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        modelNo: form.modelNo.trim() || null,
        serialNo: form.serialNo.trim() || null,
        dailyRate: parseFloat(parseComma(form.dailyRate)) || 0,
        monthlyRate: parseFloat(parseComma(form.monthlyRate)) || 0,
        depositAmount: parseFloat(parseComma(form.depositAmount)) || 0,
        memo: form.memo.trim() || null,
        status: form.status,
        acquiredAt: form.acquiredAt || null,
      };
      return editAsset
        ? apiMutate(`/api/rental-assets/${editAsset.id}`, "PUT", body)
        : apiMutate("/api/rental-assets", "POST", body);
    },
    onSuccess: () => {
      toast.success(editAsset ? "수정됐습니다" : "등록됐습니다");
      setSheet(false);
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });
  const submitting = saveMutation.isPending;
  const save = () => saveMutation.mutate();

  const removeMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/rental-assets/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("비활성화됐습니다");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });
  const remove = (id: string) => {
    if (!confirm("비활성화하시겠습니까?")) return;
    removeMutation.mutate(id);
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, onSearch: () => {}, placeholder: "자산명, 브랜드, 자산번호 검색..." }}
        onRefresh={refresh}
        onAdd={openCreate}
        addLabel="자산 추가"
        loading={loading}
      />

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>자산번호</TableHead>
              <TableHead>자산명</TableHead>
              <TableHead>브랜드</TableHead>
              <TableHead>모델 / 시리얼</TableHead>
              <TableHead className="text-right">일 요율</TableHead>
              <TableHead className="text-right">월 요율</TableHead>
              <TableHead className="text-right">보증금</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <RentalAssetsSkeletonRows />
            ) : assets.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">등록된 임대 자산이 없습니다</TableCell></TableRow>
            ) : assets.map((a) => (
              <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(a)}>
                <TableCell className="font-mono text-xs">{a.assetNo}</TableCell>
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.brand ?? "-"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[a.modelNo, a.serialNo].filter(Boolean).join(" / ") || "-"}
                </TableCell>
                <TableCell className="text-right">₩{Number(a.dailyRate).toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right">₩{Number(a.monthlyRate).toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right">₩{Number(a.depositAmount).toLocaleString("ko-KR")}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[a.status] ?? "outline"}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(a); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); remove(a.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="flex h-[90vh] flex-col p-0">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{editAsset ? "임대 자산 수정" : "임대 자산 추가"}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 p-5">
              <FieldRow label="자산명" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </FieldRow>
              <FieldRow label="브랜드">
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </FieldRow>
              <FieldRow label="모델번호">
                <Input value={form.modelNo} onChange={(e) => setForm({ ...form, modelNo: e.target.value })} />
              </FieldRow>
              <FieldRow label="시리얼번호">
                <Input value={form.serialNo} onChange={(e) => setForm({ ...form, serialNo: e.target.value })} />
              </FieldRow>
              <FieldRow label="일 요율">
                <Input
                  type="text"
                  inputMode="numeric"
                  className="text-right"
                  value={formatComma(form.dailyRate)}
                  onChange={(e) => setForm({ ...form, dailyRate: parseComma(e.target.value) })}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </FieldRow>
              <FieldRow label="월 요율">
                <Input
                  type="text"
                  inputMode="numeric"
                  className="text-right"
                  value={formatComma(form.monthlyRate)}
                  onChange={(e) => setForm({ ...form, monthlyRate: parseComma(e.target.value) })}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </FieldRow>
              <FieldRow label="보증금">
                <Input
                  type="text"
                  inputMode="numeric"
                  className="text-right"
                  value={formatComma(form.depositAmount)}
                  onChange={(e) => setForm({ ...form, depositAmount: parseComma(e.target.value) })}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </FieldRow>
              <FieldRow label="취득일">
                <Input
                  type="date"
                  value={form.acquiredAt}
                  onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })}
                />
              </FieldRow>
              <FieldRow label="상태">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })}
                >
                  {Object.entries(STATUS_LABEL).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="메모">
                <Input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </FieldRow>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 border-t border-border bg-background px-5 py-4">
            <Button variant="outline" onClick={() => setSheet(false)}>취소</Button>
            <Button onClick={save} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {editAsset ? "수정" : "등록"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-right text-sm text-muted-foreground">
        {label}{required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
    </div>
  );
}
