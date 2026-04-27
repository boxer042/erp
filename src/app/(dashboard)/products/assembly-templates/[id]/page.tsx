"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";

interface Slot {
  id: string;
  label: string;
  order: number;
  defaultProductId: string | null;
  defaultProduct: { id: string; name: string; sku: string } | null;
  defaultQuantity: string;
}

interface PresetItem {
  id: string;
  slotId: string;
  productId: string;
  quantity: string;
  product: { id: string; name: string; sku: string };
  slot: { id: string; label: string; order: number };
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  items: PresetItem[];
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  defaultLaborCost: string | null;
  isActive: boolean;
  slots: Slot[];
  presets: Preset[];
}

export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetItems, setPresetItems] = useState<
    Array<{ slotId: string; productId: string; quantity: string }>
  >([]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assembly-templates/${id}`);
      if (res.ok) setTemplate(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    fetchTemplate();
    fetchProducts();
  }, [fetchTemplate, fetchProducts]);

  const resetPresetForm = () => {
    setEditingPreset(null);
    setPresetName("");
    setPresetDescription("");
    if (template) {
      setPresetItems(
        template.slots.map((s) => ({
          slotId: s.id,
          productId: s.defaultProductId ?? "",
          quantity: s.defaultQuantity.toString(),
        })),
      );
    }
  };

  const openNewPreset = () => {
    resetPresetForm();
    setPresetSheetOpen(true);
  };

  const openEditPreset = (preset: Preset) => {
    setEditingPreset(preset);
    setPresetName(preset.name);
    setPresetDescription(preset.description ?? "");
    setPresetItems(
      template!.slots.map((s) => {
        const item = preset.items.find((i) => i.slotId === s.id);
        return {
          slotId: s.id,
          productId: item?.productId ?? s.defaultProductId ?? "",
          quantity: (item?.quantity ?? s.defaultQuantity).toString(),
        };
      }),
    );
    setPresetSheetOpen(true);
  };

  const openDuplicatePreset = (preset: Preset) => {
    setEditingPreset(null);
    setPresetName(`${preset.name} 복사본`);
    setPresetDescription(preset.description ?? "");
    setPresetItems(
      template!.slots.map((s) => {
        const item = preset.items.find((i) => i.slotId === s.id);
        return {
          slotId: s.id,
          productId: item?.productId ?? s.defaultProductId ?? "",
          quantity: (item?.quantity ?? s.defaultQuantity).toString(),
        };
      }),
    );
    setPresetSheetOpen(true);
  };

  const submitPreset = async () => {
    if (!presetName.trim()) {
      toast.error("프리셋명을 입력해주세요");
      return;
    }
    const validItems = presetItems.filter(
      (i) => i.productId && i.quantity && parseFloat(i.quantity) > 0,
    );
    if (validItems.length === 0) {
      toast.error("최소 1개 슬롯에 상품을 지정해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingPreset
        ? `/api/assembly-templates/${id}/presets/${editingPreset.id}`
        : `/api/assembly-templates/${id}/presets`;
      const res = await fetch(url, {
        method: editingPreset ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName,
          description: presetDescription || undefined,
          isActive: true,
          items: validItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(typeof err.error === "string" ? err.error : "저장 실패");
        return;
      }
      toast.success(editingPreset ? "프리셋이 수정되었습니다" : "프리셋이 등록되었습니다");
      setPresetSheetOpen(false);
      fetchTemplate();
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeletePreset = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/assembly-templates/${id}/presets/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.error === "string" ? err.error : "삭제 실패");
        return;
      }
      toast.success("프리셋이 삭제되었습니다");
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchTemplate();
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !template) {
    return <div className="p-8 text-center">로딩 중...</div>;
  }
  if (!template) {
    return <div className="p-8 text-center">템플릿을 찾을 수 없습니다</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-5 gap-4">
      <div className="flex items-center gap-2">
        <Link href="/products/assembly-templates">
          <Button variant="ghost" size="sm">
            <ArrowLeft data-icon="inline-start" />
            목록
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>{template.name}</span>
            {template.isActive ? (
              <Badge variant="success">활성</Badge>
            ) : (
              <Badge variant="secondary">비활성</Badge>
            )}
          </CardTitle>
          {template.description && (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">기본 조립비: </span>
              <span>
                {template.defaultLaborCost
                  ? `₩${Number(template.defaultLaborCost).toLocaleString("ko-KR")}`
                  : "-"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">슬롯 수: </span>
              <span>{template.slots.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>슬롯</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="h-9 px-3 text-xs text-muted-foreground w-12 text-right">순서</TableHead>
                <TableHead className="h-9 px-3 text-xs text-muted-foreground">라벨</TableHead>
                <TableHead className="h-9 px-3 text-xs text-muted-foreground text-right">기본 수량</TableHead>
                <TableHead className="h-9 px-3 text-xs text-muted-foreground">기본 상품</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {template.slots.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="px-3 py-2.5 text-right">{s.order + 1}</TableCell>
                  <TableCell className="px-3 py-2.5">{s.label}</TableCell>
                  <TableCell className="px-3 py-2.5 text-right">
                    {Number(s.defaultQuantity).toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="px-3 py-2.5">
                    {s.defaultProduct ? (
                      <div className="flex flex-col">
                        <span>{s.defaultProduct.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.defaultProduct.sku}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>프리셋</CardTitle>
          <Button size="sm" onClick={openNewPreset}>
            <Plus data-icon="inline-start" />
            프리셋 추가
          </Button>
        </CardHeader>
        <CardContent>
          {template.presets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              등록된 프리셋이 없습니다
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>프리셋명</TableHead>
                  <TableHead>구성품 요약</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-40"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {template.presets.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        {p.description && (
                          <span className="text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                      {p.items
                        .map((i) => `${i.slot.label}: ${i.product.name}`)
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      {p.isActive ? (
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
                          onClick={() => openEditPreset(p)}
                        >
                          <Pencil data-icon="inline-start" />
                          수정
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[12px]"
                          onClick={() => openDuplicatePreset(p)}
                        >
                          <Copy data-icon="inline-start" />
                          복제
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[12px] text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteTarget(p);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 data-icon="inline-start" />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={presetSheetOpen} onOpenChange={setPresetSheetOpen}>
        <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
            <SheetTitle>
              {editingPreset ? "프리셋 수정" : "프리셋 등록"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            <div className="grid grid-cols-[120px_1fr] items-center gap-2">
              <label className="text-sm text-right">프리셋명</label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="예: 3HP 기본형"
              />
            </div>
            <div className="grid grid-cols-[120px_1fr] items-start gap-2">
              <label className="text-sm text-right pt-2">설명</label>
              <Textarea
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold mb-2">슬롯별 상품</h3>
              <div className="-mx-5 border-y border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-muted-foreground text-xs">
                      <th className="border-r border-b border-border w-[40px] py-2 text-center font-medium">번호</th>
                      <th className="border-r border-b border-border py-2 px-2 text-left font-medium" style={{ width: "25%" }}>라벨</th>
                      <th className="border-r border-b border-border w-[100px] py-2 text-center font-medium">수량</th>
                      <th className="border-b border-border py-2 px-2 text-left font-medium">상품</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.slots.map((s, idx) => {
                      const item = presetItems[idx];
                      return (
                        <tr key={s.id} className="border-b border-border hover:bg-muted/50">
                          <td className="border-r border-border text-center text-muted-foreground py-1">{idx + 1}</td>
                          <td className="border-r border-border px-2 py-1">{s.label}</td>
                          <td className="border-r border-border p-0.5">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item?.quantity ?? "1"}
                              onChange={(e) =>
                                setPresetItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, quantity: e.target.value } : x,
                                  ),
                                )
                              }
                              onFocus={(e) => e.currentTarget.select()}
                              className="w-full h-7 bg-transparent text-sm px-2 text-right outline-none focus:bg-muted rounded tabular-nums"
                            />
                          </td>
                          <td className="p-0.5">
                            <ProductCombobox
                              products={products}
                              value={item?.productId ?? ""}
                              onChange={(p) =>
                                setPresetItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, productId: p.id } : x,
                                  ),
                                )
                              }
                              filterType="component"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

            <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
              <Button variant="outline" onClick={() => setPresetSheetOpen(false)}>
                취소
              </Button>
              <Button onClick={submitPreset} disabled={submitting}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                <span>{submitting ? "처리 중..." : "저장"}</span>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프리셋 삭제</DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <>
                  <span className="block">
                    &quot;{deleteTarget.name}&quot; 프리셋을 삭제하시겠습니까?
                  </span>
                  <span className="block mt-2 text-muted-foreground">
                    삭제된 프리셋은 복구할 수 없으며, 이미 등록된 조립상품에는 영향이 없습니다.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              취소
            </Button>
            <Button variant="destructive" onClick={confirmDeletePreset} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : null}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
