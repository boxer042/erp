"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, ArrowUp, ArrowDown, Plus, Upload, Loader2, Image as ImageIcon, Film, Link as LinkIcon } from "lucide-react";
import { extractYoutubeId } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function MediaSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-12 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

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
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewItem, setPreviewItem] = useState<ProductMedia | null>(null);
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
    const url = urlInput.trim();
    if (!url) {
      toast.error("URL을 입력하세요");
      return;
    }
    // URL 패턴 자동 감지: YouTube ID 추출되면 YOUTUBE, 아니면 IMAGE
    const type: MediaType = extractYoutubeId(url) ? "YOUTUBE" : "IMAGE";
    setSubmitting(true);
    try {
      await create({ type, url, title: null });
      setUrlInput("");
      await load();
      toast.success(type === "YOUTUBE" ? "YouTube 영상이 추가되었습니다" : "이미지가 추가되었습니다");
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
            title: file.name.replace(/\.[^.]+$/, "") || null,
          });
          successCount += 1;
        } catch {
          toast.error(`${file.name}: 미디어 등록 실패`);
        }
      }
      if (successCount > 0) {
        toast.success(`${successCount}개 이미지를 추가했습니다`);
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

  // URL 입력 미리 감지로 아이콘 토글
  const detectedIsYoutube = !!extractYoutubeId(urlInput.trim());

  return (
    <div>
      {/* 통합 추가 패널 — 파일 업로드 + URL (외곽선 없음, 풀폭) */}
      <div
        className={`px-4 py-4 transition-colors ${
          dragActive ? "bg-primary/5" : ""
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {/* 상단: 파일 업로드 */}
        <div className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">이미지 파일 업로드</p>
            <p className="text-xs text-muted-foreground">
              드래그앤드롭 가능 · JPG/PNG/WebP/GIF/SVG · 10MB 이하 · 여러 개 동시 업로드
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

        {/* 구분선 + 안내 */}
        <div className="my-3 flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-[11px] text-muted-foreground">또는</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* 하단: URL 입력 (자동 타입 감지) */}
        <div className="flex items-center gap-2">
          {detectedIsYoutube ? (
            <Film className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
            placeholder="YouTube URL 또는 이미지 URL 붙여넣기"
            className="h-9 flex-1"
            disabled={submitting}
          />
          <Button
            onClick={add}
            disabled={submitting || !urlInput.trim()}
            size="sm"
            variant="outline"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> 추가 중...
              </>
            ) : (
              <>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> URL 추가
              </>
            )}
          </Button>
        </div>
        {urlInput.trim() && (
          <p className="text-[11px] text-muted-foreground mt-1.5 ml-6">
            {detectedIsYoutube
              ? "YouTube 영상으로 추가됩니다"
              : "이미지 URL로 추가됩니다"}
          </p>
        )}
      </div>

      <div className="border-t border-border" />

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
            <MediaSkeletonRows />
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
                  <button
                    type="button"
                    onClick={() => setPreviewItem(m)}
                    className="block h-10 w-10 rounded overflow-hidden border border-border hover:ring-2 hover:ring-primary/40 transition-all"
                    aria-label="미리보기"
                  >
                    {m.type === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (() => {
                      const yid = extractYoutubeId(m.url);
                      return yid ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://img.youtube.com/vi/${yid}/default.jpg`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-muted">
                          <Film className="h-4 w-4 text-muted-foreground" />
                        </div>
                      );
                    })()}
                  </button>
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

      {/* 라이트박스 — 클릭 시 큰 미리보기 */}
      <Dialog open={previewItem !== null} onOpenChange={(o) => { if (!o) setPreviewItem(null); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogTitle className="sr-only">{previewItem?.title ?? "미디어 미리보기"}</DialogTitle>
          {previewItem?.type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewItem.url}
              alt={previewItem.title ?? ""}
              className="w-full max-h-[85vh] object-contain bg-black"
            />
          ) : previewItem ? (() => {
            const yid = extractYoutubeId(previewItem.url);
            return yid ? (
              <div className="aspect-video w-full bg-black">
                <iframe
                  title={previewItem.title ?? "youtube"}
                  src={`https://www.youtube.com/embed/${yid}?autoplay=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                유효하지 않은 URL 입니다
              </div>
            );
          })() : null}
          {previewItem?.title && (
            <div className="px-4 py-3 text-sm border-t border-border">
              {previewItem.title}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
