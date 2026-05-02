"use client";

import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Upload, Loader2, X, ChevronDown, ChevronRight, FolderTree,
} from "lucide-react";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface CategoryChild {
  id: string;
  name: string;
  parentId: string;
  order: number;
  imageUrl?: string | null;
  imagePath?: string | null;
  isActive: boolean;
  _count: { products: number };
}

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  imageUrl?: string | null;
  imagePath?: string | null;
  isActive: boolean;
  children: CategoryChild[];
  _count: { products: number };
}

type EditTarget = { type: "root" } | { type: "child"; parentId: string };

interface FormState {
  name: string;
  order: string;
  parentId: string | null;
  imageUrl: string | null;
  imagePath: string | null;
}

const emptyForm = (): FormState => ({
  name: "",
  order: "0",
  parentId: null,
  imageUrl: null,
  imagePath: null,
});

function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell className="w-8"><Skeleton className="h-4 w-4" /></TableCell>
          <TableCell><Skeleton className="h-8 w-8 rounded" /></TableCell>
          <TableCell><Skeleton className="h-4 w-36" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><div className="flex gap-1"><Skeleton className="h-7 w-7 rounded-md" /><Skeleton className="h-7 w-7 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>({ type: "root" });
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiGet<Category[]>("/api/categories"),
  });

  const filtered = (categoriesQuery.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<FormState>) =>
      editId
        ? apiMutate(`/api/categories/${editId}`, "PUT", {
            name: payload.name,
            parentId: payload.parentId ?? null,
            order: parseInt(payload.order ?? "0") || 0,
            imageUrl: payload.imageUrl,
            imagePath: payload.imagePath,
          })
        : apiMutate("/api/categories", "POST", {
            name: payload.name,
            parentId: payload.parentId ?? null,
            order: parseInt(payload.order ?? "0") || 0,
            imageUrl: payload.imageUrl,
            imagePath: payload.imagePath,
          }),
    onSuccess: () => {
      toast.success(editId ? "카테고리가 수정되었습니다" : "카테고리가 등록되었습니다");
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      setSheetOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiMutate(`/api/categories/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("카테고리가 삭제되었습니다");
      qc.invalidateQueries({ queryKey: queryKeys.categories.all });
      setDeleteTarget(null);
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : "삭제 실패";
      toast.error(msg);
      setDeleteTarget(null);
    },
  });

  const openCreate = (target: EditTarget) => {
    setEditId(null);
    setEditTarget(target);
    setForm({
      ...emptyForm(),
      parentId: target.type === "child" ? target.parentId : null,
    });
    setSheetOpen(true);
  };

  const openEdit = (cat: Category | CategoryChild, parentId: string | null) => {
    setEditId(cat.id);
    setEditTarget(parentId ? { type: "child", parentId } : { type: "root" });
    setForm({
      name: cat.name,
      order: String(cat.order),
      parentId: cat.parentId ?? null,
      imageUrl: cat.imageUrl ?? null,
      imagePath: cat.imagePath ?? null,
    });
    setSheetOpen(true);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/categories/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "업로드 실패");
      const data = await res.json() as { url: string; path: string };
      if (form.imagePath) {
        apiMutate("/api/categories/upload", "DELETE", { path: form.imagePath }).catch(() => {});
      }
      setForm((f) => ({ ...f, imageUrl: data.url, imagePath: data.path }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (form.imagePath) {
      apiMutate("/api/categories/upload", "DELETE", { path: form.imagePath }).catch(() => {});
    }
    setForm((f) => ({ ...f, imageUrl: null, imagePath: null }));
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, onSearch: () => {}, placeholder: "카테고리명 검색..." }}
        onAdd={() => openCreate({ type: "root" })}
        addLabel="대분류 등록"
        loading={categoriesQuery.isFetching}
        onRefresh={() => qc.invalidateQueries({ queryKey: queryKeys.categories.all })}
      />

      <div className="flex-1 overflow-auto min-h-0">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-12">이미지</TableHead>
              <TableHead>카테고리명</TableHead>
              <TableHead className="w-20 text-right">소분류</TableHead>
              <TableHead className="w-20 text-right">상품 수</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoriesQuery.isPending ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  등록된 카테고리가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cat) => (
                <React.Fragment key={cat.id}>
                  <TableRow className="border-b border-border hover:bg-muted/50">
                    <TableCell className="px-3 py-2">
                      {cat.children.length > 0 ? (
                        <button
                          onClick={() => toggleExpand(cat.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {expanded.has(cat.id) ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} className="size-8 rounded object-cover" />
                      ) : (
                        <div className="size-8 rounded bg-muted flex items-center justify-center">
                          <FolderTree className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 font-medium">{cat.name}</TableCell>
                    <TableCell className="px-3 py-2 text-right text-muted-foreground text-sm">
                      {cat.children.length}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right text-muted-foreground text-sm">
                      {cat._count.products + cat.children.reduce((s, c) => s + c._count.products, 0)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="소분류 추가"
                          onClick={() => openCreate({ type: "child", parentId: cat.id })}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(cat, null)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ id: cat.id, name: cat.name })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded.has(cat.id) &&
                    cat.children.map((child) => (
                      <TableRow key={child.id} className="border-b border-border hover:bg-muted/50 bg-muted/20">
                        <TableCell className="px-3 py-2" />
                        <TableCell className="px-3 py-2 pl-8">
                          {child.imageUrl ? (
                            <img src={child.imageUrl} alt={child.name} className="size-7 rounded object-cover" />
                          ) : (
                            <div className="size-7 rounded bg-muted flex items-center justify-center">
                              <FolderTree className="size-3.5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2 pl-8 text-sm text-muted-foreground">
                          {child.name}
                        </TableCell>
                        <TableCell />
                        <TableCell className="px-3 py-2 text-right text-muted-foreground text-sm">
                          {child._count.products}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEdit(child, cat.id)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: child.id, name: child.name })}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 등록/수정 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[90dvh] p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 shrink-0">
            <SheetTitle>
              {editId ? "카테고리 수정" : editTarget.type === "child" ? "소분류 등록" : "대분류 등록"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-name">카테고리명 *</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={editTarget.type === "child" ? "예: 전기형, 엔진형" : "예: 고압분무기"}
              />
            </div>

            {editTarget.type === "root" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-parent">상위 카테고리 (소분류로 등록 시)</Label>
                <Select
                  value={form.parentId ?? "__none__"}
                  onValueChange={(v) => setForm((f) => ({ ...f, parentId: v === "__none__" ? null : v }))}
                >
                  <SelectTrigger id="cat-parent">
                    <SelectValue placeholder="없음 (대분류)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">없음 (대분류)</SelectItem>
                    {(categoriesQuery.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-order">순서</Label>
              <Input
                id="cat-order"
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>이미지</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
              {form.imageUrl ? (
                <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border">
                  <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-1 right-1 bg-background/80 rounded p-0.5 hover:bg-background"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-24 h-24 rounded-lg border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="size-5" />
                      <span className="text-xs">업로드</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background shrink-0">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>취소</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
              {editId ? "수정" : "등록"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* 삭제 확인 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카테고리 삭제</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> 카테고리를 삭제하시겠습니까?<br />
              하위 카테고리나 연결된 상품이 있으면 삭제할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>취소</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
