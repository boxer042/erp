"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, ArrowUp, ArrowDown, Plus, Upload, Loader2, Image as ImageIcon, Film } from "lucide-react";
import { extractYoutubeId } from "@/lib/utils";

type MediaType = "IMAGE" | "YOUTUBE";

interface ProductMedia {
  id: string;
  productId: string;
  type: MediaType;
  url: string;
  title: string | null;
  sortOrder: number;
}

export function ProductMediaManager({ productId }: { productId: string }) {
  const [items, setItems] = useState<ProductMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ type: MediaType; url: string; title: string }>({
    type: "IMAGE",
    url: "",
    title: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/product-media?productId=${productId}`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (data: { type: MediaType; url: string; title: string | null }) => {
    const res = await fetch("/api/product-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        ...data,
        sortOrder: items.length,
      }),
    });
    if (!res.ok) throw new Error();
  };

  const add = async () => {
    if (!form.url.trim()) {
      toast.error("URL을 입력하세요");
      return;
    }
    if (form.type === "YOUTUBE" && !extractYoutubeId(form.url)) {
      toast.error("유효한 YouTube URL이 아닙니다");
      return;
    }
    setSubmitting(true);
    try {
      await create({ type: form.type, url: form.url.trim(), title: form.title.trim() || null });
      setForm({ type: form.type, url: "", title: "" });
      await load();
      toast.success("추가되었습니다");
    } catch {
      toast.error("추가에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch("/api/products/upload", { method: "POST", body: fd });
        if (!upRes.ok) {
          const err = await upRes.json().catch(() => ({}));
          toast.error(err.error || `${file.name}: 업로드 실패`);
          continue;
        }
        const { url } = (await upRes.json()) as { url: string };
        try {
          await create({
            type: "IMAGE",
            url,
            title: form.title.trim() || file.name.replace(/\.[^.]+$/, "") || null,
          });
          successCount += 1;
        } catch {
          toast.error(`${file.name}: 미디어 등록 실패`);
        }
      }
      if (successCount > 0) {
        toast.success(`${successCount}개 이미지를 추가했습니다`);
        setForm({ type: form.type, url: "", title: "" });
        await load();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    const res = await fetch(`/api/product-media/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      toast.success("삭제되었습니다");
    } else {
      toast.error("삭제에 실패했습니다");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      fetch(`/api/product-media/${a.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/product-media/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    await load();
  };

  return (
    <div className="space-y-4">
      {/* 이미지 업로드 — drop & click */}
      <div
        className="rounded-lg border border-dashed border-border p-4 hover:bg-muted/30 transition-colors"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">이미지 업로드</p>
            <p className="text-xs text-muted-foreground">
              JPG/PNG/WebP/GIF/SVG · 10MB 이하 · 여러 개 동시 업로드 가능
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> 업로드 중...
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> 파일 선택
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {/* URL 직접 입력 (YouTube + 외부 이미지 URL) */}
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">URL로 추가 (YouTube · 외부 이미지)</span>
        </div>
        <div className="grid grid-cols-[120px_1fr_1fr_auto] items-end gap-2">
          <div>
            <Label className="text-[11px] text-muted-foreground">타입</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as MediaType })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YOUTUBE">YouTube</SelectItem>
                <SelectItem value="IMAGE">이미지 URL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">URL</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder={form.type === "YOUTUBE" ? "https://youtu.be/..." : "https://..."}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">제목 (선택)</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="h-9"
            />
          </div>
          <Button onClick={add} disabled={submitting} size="sm" className="h-9">
            <Plus className="mr-1 h-3.5 w-3.5" /> 추가
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">순서</TableHead>
            <TableHead className="w-[80px]">미리보기</TableHead>
            <TableHead className="w-[100px]">타입</TableHead>
            <TableHead>URL</TableHead>
            <TableHead>제목</TableHead>
            <TableHead className="w-[60px] text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                로딩 중...
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                등록된 미디어가 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((m, i) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  {m.type === "IMAGE" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.url}
                      alt=""
                      className="h-10 w-10 rounded object-cover border border-border"
                    />
                  ) : (
                    <Film className="h-5 w-5 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>{m.type === "YOUTUBE" ? "YouTube" : "이미지"}</TableCell>
                <TableCell className="max-w-[320px] truncate">
                  <a href={m.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {m.url}
                  </a>
                </TableCell>
                <TableCell>{m.title ?? ""}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => remove(m.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
