"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { formatComma, parseComma } from "@/lib/utils";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  defaultLaborCost: string | null;
  isActive: boolean;
  _count: { slots: number; presets: number };
  createdAt: string;
}

interface SlotRow {
  id?: string;
  label: string;
  order: number;
  defaultProductId: string | null;
  defaultQuantity: string;
}

export default function AssemblyTemplatesPage() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultLaborCost, setDefaultLaborCost] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<SlotRow[]>([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assembly-templates");
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await fetch("/api/products");
    if (res.ok) {
      const data = await res.json();
      setProducts(
        data.map((p: {
          id: string; name: string; sku: string;
          sellingPrice: string; unitCost: string | null;
          unitOfMeasure: string; isSet: boolean;
        }) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          sellingPrice: p.sellingPrice,
          unitCost: p.unitCost,
          unitOfMeasure: p.unitOfMeasure,
          isSet: p.isSet,
        })),
      );
    }
  }, []);

  useEffect(() => {
    fetchRows();
    fetchProducts();
  }, [fetchRows, fetchProducts]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setDefaultLaborCost("");
    setIsActive(true);
    setSlots([{ label: "", order: 0, defaultProductId: null, defaultQuantity: "1" }]);
  };

  const openCreate = () => {
    reset();
    setSheetOpen(true);
  };

  const openEdit = async (row: TemplateRow) => {
    try {
      const res = await fetch(`/api/assembly-templates/${row.id}`);
      if (!res.ok) {
        toast.error("템플릿을 불러오지 못했습니다");
        return;
      }
      const t = (await res.json()) as {
        id: string;
        name: string;
        description: string | null;
        defaultLaborCost: string | null;
        isActive: boolean;
        slots: Array<{
          id: string;
          label: string;
          order: number;
          defaultProductId: string | null;
          defaultQuantity: string;
        }>;
      };
      setEditingId(t.id);
      setName(t.name);
      setDescription(t.description ?? "");
      setDefaultLaborCost(t.defaultLaborCost ?? "");
      setIsActive(t.isActive);
      setSlots(
        t.slots
          .sort((a, b) => a.order - b.order)
          .map((s) => ({
            id: s.id,
            label: s.label,
            order: s.order,
            defaultProductId: s.defaultProductId,
            defaultQuantity: s.defaultQuantity.toString(),
          })),
      );
      setSheetOpen(true);
    } catch {
      toast.error("템플릿을 불러오지 못했습니다");
    }
  };

  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        label: "",
        order: prev.length,
        defaultProductId: null,
        defaultQuantity: "1",
      },
    ]);

  const removeSlot = (idx: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== idx));

  const updateSlot = (idx: number, patch: Partial<SlotRow>) =>
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );

  const submit = async () => {
    if (!name.trim()) {
      toast.error("템플릿명을 입력해주세요");
      return;
    }
    if (slots.length === 0 || slots.some((s) => !s.label.trim())) {
      toast.error("슬롯 라벨을 모두 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingId
        ? `/api/assembly-templates/${editingId}`
        : "/api/assembly-templates";
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          defaultLaborCost: defaultLaborCost || null,
          isActive,
          slots: slots.map((s, idx) => ({
            id: s.id,
            label: s.label,
            order: idx,
            defaultProductId: s.defaultProductId,
            defaultQuantity: s.defaultQuantity,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "저장 실패");
        return;
      }
      toast.success(
        editingId ? "템플릿이 수정되었습니다" : "템플릿이 등록되었습니다",
      );
      setSheetOpen(false);
      fetchRows();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/assembly-templates/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "삭제 실패");
        return;
      }
      toast.success("템플릿이 삭제되었습니다");
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchRows();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        onRefresh={fetchRows}
        onAdd={openCreate}
        addLabel="템플릿 등록"
        loading={loading}
      />

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>템플릿명</TableHead>
              <TableHead>설명</TableHead>
              <TableHead className="text-right">슬롯 수</TableHead>
              <TableHead className="text-right">프리셋 수</TableHead>
              <TableHead className="text-right">기본 조립비</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-40 text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  로딩 중...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  등록된 템플릿이 없습니다
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/products/assembly-templates/${r.id}`} className="text-primary">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {r.description ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {r._count.slots}
                  </TableCell>
                  <TableCell className="text-right">
                    {r._count.presets}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.defaultLaborCost
                      ? `₩${Number(r.defaultLaborCost).toLocaleString("ko-KR")}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {r.isActive ? (
                      <Badge variant="success">활성</Badge>
                    ) : (
                      <Badge variant="secondary">비활성</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[12px]"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil data-icon="inline-start" />
                        수정
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[12px] text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteTarget(r);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 data-icon="inline-start" />
                        삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>
              {editingId ? "조립 템플릿 수정" : "조립 템플릿 등록"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-sm text-right">템플릿명</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 고압분무기 조립"
              />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-start gap-2">
              <label className="text-sm text-right pt-2">설명</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-sm text-right">기본 조립비</label>
              <Input
                type="text"
                inputMode="numeric"
                value={formatComma(defaultLaborCost)}
                onChange={(e) => setDefaultLaborCost(parseComma(e.target.value))}
                onFocus={(e) => e.currentTarget.select()}
                className="max-w-[200px]"
                placeholder="선택"
              />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-sm text-right">상태</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={(v) => setIsActive(!!v)}
                />
                활성 (비활성이면 전용 등록 페이지에 표시되지 않습니다)
              </label>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-2">슬롯 (구성품 라벨)</h3>
              <div className="-mx-5 border-y border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs">
                      <th className="border-r border-b border-border w-[40px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-border py-2 px-2 text-left font-medium" style={{ width: "25%" }}>라벨</th>
                      <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">수량</th>
                      <th className="border-r border-b border-border py-2 px-2 text-left font-medium">기본 상품</th>
                      <th className="border-b border-border w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s, idx) => (
                      <tr key={idx} className="group border-b border-border hover:bg-muted/50">
                        <td className="border-r border-border text-center text-muted-foreground py-1">{idx + 1}</td>
                        <td className="border-r border-border p-0.5">
                          <input
                            value={s.label}
                            onChange={(e) => updateSlot(idx, { label: e.target.value })}
                            placeholder="예: 모터"
                            className="w-full h-7 bg-transparent text-sm px-2 outline-none focus:bg-muted rounded"
                          />
                        </td>
                        <td className="border-r border-border p-0.5">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={s.defaultQuantity}
                            onChange={(e) => updateSlot(idx, { defaultQuantity: e.target.value })}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full h-7 bg-transparent text-sm px-2 text-right outline-none focus:bg-muted rounded tabular-nums"
                          />
                        </td>
                        <td className="border-r border-border p-0.5">
                          <ProductCombobox
                            products={products}
                            value={s.defaultProductId ?? ""}
                            onChange={(p) => updateSlot(idx, { defaultProductId: p.id })}
                            filterType="component"
                            placeholder="기본 상품 (선택)"
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => removeSlot(idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={5} className="py-1.5 px-2">
                        <button
                          type="button"
                          onClick={addSlot}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 transition-colors px-1 py-0.5"
                        >
                          <Plus className="size-3.5" />
                          슬롯 추가
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button variant="outline" onClick={() => setSheetOpen(false)}>
                취소
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>
                  {submitting ? "처리 중..." : editingId ? "수정" : "등록"}
                </span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>템플릿 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  <span className="block">
                    &quot;{deleteTarget.name}&quot; 템플릿을 삭제하시겠습니까?
                  </span>
                  <span className="block mt-2 text-muted-foreground">
                    템플릿에 연결된 슬롯과 프리셋({deleteTarget._count.presets}개)이 모두 함께 삭제됩니다.
                    이미 등록된 조립상품에는 영향이 없습니다.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
