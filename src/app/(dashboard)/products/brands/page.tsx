"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Loader2, X } from "lucide-react";
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
  logoPath?: string | null;
  memo?: string | null;
  isActive: boolean;
  _count: { products: number };
}

const brandsKey = ["brands"] as const;

function BrandSkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-8 w-8 rounded" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-7 w-7 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

export default function BrandsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const brandsQuery = useQuery({
    queryKey: brandsKey,
    queryFn: () => apiGet<Brand[]>("/api/brands?includeInactive=true"),
  });

  const filtered = (brandsQuery.data ?? []).filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      <DataTableToolbar
        search={{
          value: search,
          onChange: setSearch,
          onSearch: () => {},
          placeholder: "브랜드명 검색...",
        }}
        onAdd={() => setCreateOpen(true)}
        addLabel="브랜드 등록"
        loading={brandsQuery.isFetching}
        onRefresh={() => qc.invalidateQueries({ queryKey: brandsKey })}
      />
      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">로고</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="text-right">상품 수</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-[80px] text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brandsQuery.isPending ? (
              <BrandSkeletonRows />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  등록된 브랜드가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer"
                  onClick={() => setEditing(b)}
                >
                  <TableCell>
                    {b.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.logoUrl} alt="" className="h-8 w-8 rounded object-contain bg-card border border-border" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{b._count.products}</TableCell>
                  <TableCell>
                    <Badge variant={b.isActive ? "success" : "secondary"}>
                      {b.isActive ? "활성" : "비활성"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BrandCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <BrandEditSheet brand={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ============================================================
// 신규 브랜드 등록 Dialog
// ============================================================

function BrandCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: { name: string; memo: string }) =>
      apiMutate("/api/brands", "POST", body),
    onSuccess: () => {
      toast.success("브랜드가 등록되었습니다");
      qc.invalidateQueries({ queryKey: brandsKey });
      setName("");
      setMemo("");
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "등록 실패"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>브랜드 등록</DialogTitle>
          <DialogDescription>로고는 등록 후 상세에서 업로드합니다</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="brand-name">브랜드명 *</Label>
            <Input
              id="brand-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && name.trim()) {
                  e.preventDefault();
                  createMutation.mutate({ name: name.trim(), memo: memo.trim() });
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-memo">메모</Label>
            <Input id="brand-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={() => createMutation.mutate({ name: name.trim(), memo: memo.trim() })}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 브랜드 수정 Sheet (로고 + 모델 관리)
// ============================================================

function BrandEditSheet({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);

  const open = brand !== null;

  // 시트 열릴 때 form 초기화
  if (brand && name === "" && brand.name) {
    setName(brand.name);
    setMemo(brand.memo ?? "");
    setLogoUrl(brand.logoUrl ?? null);
    setLogoPath(brand.logoPath ?? null);
    setIsActive(brand.isActive);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/brands/${brand!.id}`, "PUT", {
        name: name.trim(),
        memo: memo.trim() || null,
        logoUrl,
        logoPath,
        isActive,
      }),
    onSuccess: () => {
      toast.success("저장되었습니다");
      qc.invalidateQueries({ queryKey: brandsKey });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiMutate(`/api/brands/${brand!.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("브랜드가 비활성화되었습니다");
      qc.invalidateQueries({ queryKey: brandsKey });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "삭제 실패"),
  });

  const handleClose = () => {
    setName("");
    setMemo("");
    setLogoUrl(null);
    setLogoPath(null);
    setIsActive(true);
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/brands/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "업로드 실패");
        return;
      }
      // 기존 로고가 있으면 삭제
      if (logoPath) {
        await apiMutate("/api/brands/upload", "DELETE", { path: logoPath });
      }
      setLogoUrl(json.url);
      setLogoPath(json.path);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (logoPath) {
      await apiMutate("/api/brands/upload", "DELETE", { path: logoPath });
    }
    setLogoUrl(null);
    setLogoPath(null);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>브랜드 수정</SheetTitle>
          <SheetDescription className="sr-only">브랜드 정보와 모델을 관리합니다</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-5 space-y-5">
            {/* 로고 */}
            <div className="space-y-2">
              <Label>로고</Label>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoUrl} alt="" className="h-20 w-20 rounded object-contain bg-card border border-border" />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground inline-flex items-center justify-center"
                      aria-label="로고 제거"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded border-2 border-dashed border-border flex items-center justify-center text-muted-foreground text-[10px]">
                    로고 없음
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  {logoUrl ? "교체" : "업로드"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">JPG/PNG/WebP/SVG · 최대 5MB</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-brand-name">브랜드명 *</Label>
              <Input id="edit-brand-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand-memo">메모</Label>
              <Input id="edit-brand-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(c) => setIsActive(c === true)} />
              활성
            </label>
          </div>
        </ScrollArea>
        <div className="border-t px-5 py-4 flex justify-between gap-2">
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => {
              if (confirm("이 브랜드를 비활성화하시겠습니까?")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            비활성화
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>취소</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={!name.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              저장
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
