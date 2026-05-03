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
import { Trash2, ArrowUp, ArrowDown, Plus, Upload, Loader2, Image as ImageIcon, Film, Link as LinkIcon, Star, Library } from "lucide-react";
import { extractYoutubeId } from "@/lib/utils";
import { apiGet, apiMutate } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageEditDialog } from "@/components/image-edit-dialog";
import { MediaPickerDialog } from "@/components/media-picker-dialog";

function MediaSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-7 w-7 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-12 w-12 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-7 w-20 rounded-md" /></TableCell>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><div className="flex justify-end"><Skeleton className="h-8 w-8 rounded-md" /></div></TableCell>
        </TableRow>
      ))}
    </>
  );
}

type MediaType = "IMAGE" | "YOUTUBE";
type MediaKind = "THUMBNAIL" | "DETAIL";

interface ProductMedia {
  id: string;
  productId: string;
  type: MediaType;
  kind: MediaKind;
  url: string;
  title: string | null;
  sortOrder: number;
}

interface ProductMediaManagerProps {
  productId: string;
  /** 현재 대표 이미지 URL (Product.imageUrl). 별 아이콘 표시·"대표로 설정" 동작에 사용 */
  imageUrl?: string | null;
  /** 대표 이미지가 변경됐을 때 부모에 알림 (예: React Query invalidate) */
  onImageUrlChange?: () => void;
}

export function ProductMediaManager({ productId, imageUrl, onImageUrlChange }: ProductMediaManagerProps) {
  const [items, setItems] = useState<ProductMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewItem, setPreviewItem] = useState<ProductMedia | null>(null);
  const [editQueue, setEditQueue] = useState<File[]>([]);
  const [editIndex, setEditIndex] = useState(0);
  const [batchSuccess, setBatchSuccess] = useState(0);
  const [editKind, setEditKind] = useState<MediaKind>("THUMBNAIL");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<MediaKind>("THUMBNAIL");
  const [picking, setPicking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentEditFile = editQueue[editIndex] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiGet<ProductMedia[]>(`/api/product-media?productId=${productId}`));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = (data: { type: MediaType; kind: MediaKind; url: string; title: string | null }) =>
    apiMutate("/api/product-media", "POST", {
      productId,
      ...data,
      sortOrder: items.length,
    });

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
      // 외부 URL은 비율을 강제할 수 없어 DETAIL 기본
      await create({ type, kind: "DETAIL", url, title: null });
      setUrlInput("");
      await load();
      toast.success(type === "YOUTUBE" ? "YouTube 영상이 추가되었습니다" : "이미지가 추가되었습니다");
    } catch {
      toast.error("추가에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFiles = (files: FileList | null, kind: MediaKind) => {
    if (!files || files.length === 0) return;
    setEditKind(kind);
    setEditQueue(Array.from(files));
    setEditIndex(0);
    setBatchSuccess(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadOne = async (data: Blob | File, name: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      // append 시 3번째 인자로 파일명 지정 (Blob이어도 정상 처리됨)
      fd.append("file", data, name);
      const upRes = await fetch("/api/products/upload", { method: "POST", body: fd });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        toast.error(err.error || `${name}: 업로드 실패`);
        return false;
      }
      const { url } = (await upRes.json()) as { url: string };
      try {
        await create({
          type: "IMAGE",
          kind: editKind,
          url,
          title: name.replace(/\.[^.]+$/, "") || null,
        });
        return true;
      } catch {
        toast.error(`${name}: 미디어 등록 실패`);
        return false;
      }
    } finally {
      setUploading(false);
    }
  };

  const advanceQueue = async (incrementSuccess: boolean) => {
    const nextSuccess = batchSuccess + (incrementSuccess ? 1 : 0);
    const next = editIndex + 1;
    if (next >= editQueue.length) {
      if (nextSuccess > 0) {
        toast.success(`${nextSuccess}개 이미지를 추가했습니다`);
        await load();
        // 서버 측에서 Product.imageUrl이 자동 동기화됐을 수 있어 부모 캐시 갱신 알림
        onImageUrlChange?.();
      }
      setEditQueue([]);
      setEditIndex(0);
      setBatchSuccess(0);
    } else {
      setBatchSuccess(nextSuccess);
      setEditIndex(next);
    }
  };

  const handleEditConfirm = async (edited: Blob, name: string) => {
    const ok = await uploadOne(edited, name);
    await advanceQueue(ok);
  };

  const handleEditCancel = async () => {
    await advanceQueue(false);
  };

  const handlePickFromLibrary = async ({ url, name }: { url: string; name: string }) => {
    setPicking(true);
    try {
      await create({
        type: "IMAGE",
        kind: pickerKind,
        url,
        title: name.replace(/\.[^.]+$/, "") || null,
      });
      await load();
      onImageUrlChange?.();
      toast.success("이미지가 추가되었습니다");
      setPickerOpen(false);
    } catch {
      toast.error("추가에 실패했습니다");
    } finally {
      setPicking(false);
    }
  };

  const updateKind = async (id: string, kind: MediaKind) => {
    try {
      await apiMutate(`/api/product-media/${id}`, "PUT", { kind });
      await load();
    } catch {
      toast.error("종류 변경 실패");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await apiMutate(`/api/product-media/${id}`, "DELETE");
      await load();
      toast.success("삭제되었습니다");
    } catch {
      toast.error("삭제에 실패했습니다");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const a = items[index];
    const b = items[target];
    await Promise.all([
      apiMutate(`/api/product-media/${a.id}`, "PUT", { sortOrder: b.sortOrder }),
      apiMutate(`/api/product-media/${b.id}`, "PUT", { sortOrder: a.sortOrder }),
    ]);
    await load();
  };

  const setPrimary = async (m: ProductMedia) => {
    if (m.type !== "IMAGE") {
      toast.error("이미지만 대표로 설정할 수 있습니다");
      return;
    }
    if (m.url === imageUrl) return;
    try {
      await apiMutate(`/api/products/${productId}`, "PATCH", { imageUrl: m.url });
      toast.success("대표 이미지로 설정되었습니다");
      onImageUrlChange?.();
    } catch {
      toast.error("대표 이미지 설정에 실패했습니다");
    }
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
          // 드래그앤드롭은 썸네일로 기본 처리 (1:1 lock)
          handleFiles(e.dataTransfer.files, "THUMBNAIL");
        }}
      >
        {/* 상단: 파일 업로드 (kind 별 분리) */}
        <div className="flex items-start gap-3">
          <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">이미지 파일 업로드</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">썸네일</span>은 1:1 정사각 (카드/리스트), <span className="font-medium text-foreground">상세 이미지</span>는 자유 비율 (상세 페이지)
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditKind("THUMBNAIL");
                fileInputRef.current?.click();
              }}
              disabled={uploading || editQueue.length > 0}
            >
              {uploading || editQueue.length > 0 ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              {editQueue.length > 0
                ? `편집 중 (${editIndex + 1}/${editQueue.length})`
                : "썸네일 (1:1)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditKind("DETAIL");
                fileInputRef.current?.click();
              }}
              disabled={uploading || editQueue.length > 0}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              상세 이미지 (자유)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPickerKind("THUMBNAIL");
                setPickerOpen(true);
              }}
              disabled={uploading || picking || editQueue.length > 0}
            >
              {picking ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Library className="mr-1.5 h-3.5 w-3.5" />
              )}
              라이브러리
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files, editKind)}
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
            <TableHead className="w-[60px]">대표</TableHead>
            <TableHead className="w-[80px]">순서</TableHead>
            <TableHead className="w-[80px]">미리보기</TableHead>
            <TableHead className="w-[100px]">타입</TableHead>
            <TableHead className="w-[120px]">종류</TableHead>
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
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                등록된 미디어가 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((m, i) => {
              const isPrimary = m.type === "IMAGE" && m.url === imageUrl;
              return (
              <TableRow key={m.id}>
                <TableCell>
                  <Button
                    size="icon"
                    variant={isPrimary ? "default" : "ghost"}
                    className="h-7 w-7"
                    onClick={() => setPrimary(m)}
                    disabled={m.type !== "IMAGE" || isPrimary}
                    aria-label={isPrimary ? "현재 대표 이미지" : "대표 이미지로 설정"}
                    title={
                      m.type !== "IMAGE"
                        ? "이미지만 대표로 설정 가능"
                        : isPrimary
                          ? "현재 대표 이미지"
                          : "대표 이미지로 설정"
                    }
                  >
                    <Star className={`h-3.5 w-3.5 ${isPrimary ? "fill-current" : ""}`} />
                  </Button>
                </TableCell>
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
                <TableCell>
                  {m.type === "IMAGE" ? (
                    <select
                      value={m.kind}
                      onChange={(e) => updateKind(m.id, e.target.value as MediaKind)}
                      className="h-7 px-1.5 text-xs rounded border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="THUMBNAIL">썸네일</option>
                      <option value="DETAIL">상세</option>
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
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
              );
            })
          )}
        </TableBody>
      </Table>

      {/* 업로드 직전 편집 다이얼로그 — kind에 따라 비율 잠금/자유 분기 */}
      <ImageEditDialog
        open={currentEditFile !== null}
        file={currentEditFile}
        defaultAspect={editKind === "THUMBNAIL" ? 1 : 16 / 9}
        lockAspect={editKind === "THUMBNAIL"}
        onConfirm={handleEditConfirm}
        onCancel={handleEditCancel}
      />

      {/* 라이브러리에서 이미지 선택 */}
      <MediaPickerDialog
        open={pickerOpen}
        bucket="product-images"
        onSelect={handlePickFromLibrary}
        onClose={() => setPickerOpen(false)}
      />

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
