"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate } from "@/lib/api-client";
import { extractYoutubeId } from "@/lib/utils";
import {
  ImagePickerDrawer,
  type ImageChoice,
  type PickResult,
} from "@/components/image-input";
import {
  JmButton,
  JmDialog,
  JmDialogContent,
  JmDialogTitle,
  JmIconButton,
  JmInput,
  JmSelect,
  JmSkeleton,
  JmTable,
  JmTableBody,
  JmTableCell,
  JmTableHead,
  JmTableHeader,
  JmTableRow,
} from "@/jm";

function MediaSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <JmTableRow key={i} className="hover:bg-transparent">
          <JmTableCell><JmSkeleton className="h-7 w-7 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-8" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-12 w-12 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-5 w-16 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-7 w-20 rounded-md" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-48" /></JmTableCell>
          <JmTableCell><JmSkeleton className="h-4 w-32" /></JmTableCell>
          <JmTableCell>
            <div className="flex justify-end">
              <JmSkeleton className="h-8 w-8 rounded-md" />
            </div>
          </JmTableCell>
        </JmTableRow>
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

const KIND_OPTIONS = [
  { value: "THUMBNAIL", label: "썸네일" },
  { value: "DETAIL", label: "상세" },
];

export function ProductMediaManager({
  productId,
  imageUrl,
  onImageUrlChange,
}: ProductMediaManagerProps) {
  const [items, setItems] = useState<ProductMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewItem, setPreviewItem] = useState<ProductMedia | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const create = (data: {
    type: MediaType;
    kind: MediaKind;
    url: string;
    title: string | null;
  }) =>
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
    const type: MediaType = extractYoutubeId(url) ? "YOUTUBE" : "IMAGE";
    setSubmitting(true);
    try {
      await create({ type, kind: "DETAIL", url, title: null });
      setUrlInput("");
      await load();
      toast.success(
        type === "YOUTUBE" ? "YouTube 영상이 추가되었습니다" : "이미지가 추가되었습니다",
      );
    } catch {
      toast.error("추가에 실패했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  // 드로워 결과 → ProductMedia 행 생성. [1:1 썸네일]=THUMBNAIL, [자유]/[라이브러리]=DETAIL.
  const handleDrawerResult = async (results: PickResult[], choice: ImageChoice) => {
    if (results.length === 0) return;
    const kind: MediaKind = choice === "thumbnail" ? "THUMBNAIL" : "DETAIL";
    setSubmitting(true);
    try {
      for (let i = 0; i < results.length; i++) {
        await apiMutate("/api/product-media", "POST", {
          productId,
          type: "IMAGE",
          kind,
          url: results[i].url,
          title: null,
          sortOrder: items.length + i,
        });
      }
      await load();
      onImageUrlChange?.();
      toast.success(`${results.length}개 이미지를 추가했습니다`);
    } catch {
      toast.error("추가에 실패했습니다");
    } finally {
      setSubmitting(false);
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

  const detectedIsYoutube = !!extractYoutubeId(urlInput.trim());

  return (
    <div>
      {/* 통합 추가 패널 — 파일 업로드 + URL */}
      <div className="px-4 py-4">
        {/* 상단: 이미지 추가 (하단 드로워) */}
        <div className="flex items-start gap-3">
          <ImageIcon className="size-5 text-[var(--jm-text-muted)] shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <p className="text-jm-sm font-medium text-[var(--jm-text)]">
              이미지 추가
            </p>
            <p className="text-jm-xs text-[var(--jm-text-muted)]">
              <span className="font-medium text-[var(--jm-text)]">썸네일</span>은 1:1
              정사각 (카드/리스트),{" "}
              <span className="font-medium text-[var(--jm-text)]">상세</span>는 자유
              비율 (상세 페이지)
            </p>
          </div>
          <JmButton
            size="sm"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Upload />}
            <span>이미지 추가</span>
          </JmButton>
        </div>
        <ImagePickerDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          context="product"
          multiple
          onResult={handleDrawerResult}
        />

        {/* 구분선 + 안내 */}
        <div className="my-3 flex items-center gap-3">
          <div className="flex-1 border-t border-[var(--jm-border)]" />
          <span className="text-jm-xs text-[var(--jm-text-muted)]">또는</span>
          <div className="flex-1 border-t border-[var(--jm-border)]" />
        </div>

        {/* 하단: URL 입력 (자동 타입 감지) */}
        <div className="flex items-center gap-2">
          {detectedIsYoutube ? (
            <Film className="size-4 text-[var(--jm-text-muted)] shrink-0" />
          ) : (
            <LinkIcon className="size-4 text-[var(--jm-text-muted)] shrink-0" />
          )}
          <JmInput
            size="sm"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                add();
              }
            }}
            placeholder="YouTube URL 또는 이미지 URL 붙여넣기"
            className="flex-1"
            disabled={submitting}
          />
          <JmButton
            onClick={add}
            disabled={submitting || !urlInput.trim()}
            size="sm"
            variant="outline"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" />
                <span>추가 중...</span>
              </>
            ) : (
              <>
                <Plus />
                <span>URL 추가</span>
              </>
            )}
          </JmButton>
        </div>
        {urlInput.trim() && (
          <p className="text-jm-xs text-[var(--jm-text-muted)] mt-1.5 ml-6">
            {detectedIsYoutube
              ? "YouTube 영상으로 추가됩니다"
              : "이미지 URL로 추가됩니다"}
          </p>
        )}
      </div>

      <div className="border-t border-[var(--jm-border)]" />

      <JmTable>
        <JmTableHeader>
          <JmTableRow className="bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] text-xs hover:bg-[var(--jm-surface-muted)]">
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[60px]">
              대표
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[80px]">
              순서
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[80px]">
              미리보기
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[100px]">
              타입
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[120px]">
              종류
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              URL
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium">
              제목
            </JmTableHead>
            <JmTableHead className="border-b border-[var(--jm-border)] h-auto py-1.5 px-3 font-medium w-[60px] text-right">
              액션
            </JmTableHead>
          </JmTableRow>
        </JmTableHeader>
        <JmTableBody>
          {loading ? (
            <MediaSkeletonRows />
          ) : items.length === 0 ? (
            <JmTableRow className="hover:bg-transparent">
              <JmTableCell
                colSpan={8}
                className="text-center py-8 text-[var(--jm-text-muted)]"
              >
                등록된 미디어가 없습니다
              </JmTableCell>
            </JmTableRow>
          ) : (
            items.map((m, i) => {
              const isPrimary = m.type === "IMAGE" && m.url === imageUrl;
              return (
                <JmTableRow key={m.id}>
                  <JmTableCell className="px-3 py-2">
                    <JmIconButton
                      size="sm"
                      variant={isPrimary ? "solid" : "ghost"}
                      onClick={() => setPrimary(m)}
                      disabled={m.type !== "IMAGE" || isPrimary}
                      aria-label={
                        isPrimary ? "현재 대표 이미지" : "대표 이미지로 설정"
                      }
                      title={
                        m.type !== "IMAGE"
                          ? "이미지만 대표로 설정 가능"
                          : isPrimary
                            ? "현재 대표 이미지"
                            : "대표 이미지로 설정"
                      }
                    >
                      <Star className={`size-3.5 ${isPrimary ? "fill-current" : ""}`} />
                    </JmIconButton>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    <div className="flex gap-1">
                      <JmIconButton
                        size="sm"
                        variant="outline"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label="위로"
                      >
                        <ArrowUp />
                      </JmIconButton>
                      <JmIconButton
                        size="sm"
                        variant="outline"
                        onClick={() => move(i, 1)}
                        disabled={i === items.length - 1}
                        aria-label="아래로"
                      >
                        <ArrowDown />
                      </JmIconButton>
                    </div>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(m)}
                      className="block size-10 rounded overflow-hidden border border-[var(--jm-border)] hover:ring-2 hover:ring-[var(--jm-info-fg)]/40 transition-all"
                      aria-label="미리보기"
                    >
                      {m.type === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        (() => {
                          const yid = extractYoutubeId(m.url);
                          return yid ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://img.youtube.com/vi/${yid}/default.jpg`}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="size-full flex items-center justify-center bg-[var(--jm-surface-muted)]">
                              <Film className="size-4 text-[var(--jm-text-muted)]" />
                            </div>
                          );
                        })()
                      )}
                    </button>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-[var(--jm-text)]">
                    {m.type === "YOUTUBE" ? "YouTube" : "이미지"}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2">
                    {m.type === "IMAGE" ? (
                      <JmSelect
                        size="sm"
                        options={KIND_OPTIONS}
                        value={m.kind}
                        onChange={(v) => updateKind(m.id, v as MediaKind)}
                      />
                    ) : (
                      <span className="text-jm-xs text-[var(--jm-text-muted)]">—</span>
                    )}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 max-w-[320px] truncate">
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--jm-info-fg)] hover:underline"
                    >
                      {m.url}
                    </a>
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-[var(--jm-text)]">
                    {m.title ?? ""}
                  </JmTableCell>
                  <JmTableCell className="px-3 py-2 text-right">
                    <JmIconButton
                      size="sm"
                      variant="outline"
                      onClick={() => remove(m.id)}
                      aria-label="삭제"
                    >
                      <Trash2 />
                    </JmIconButton>
                  </JmTableCell>
                </JmTableRow>
              );
            })
          )}
        </JmTableBody>
      </JmTable>

      {/* 라이트박스 */}
      <JmDialog
        open={previewItem !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewItem(null);
        }}
      >
        <JmDialogContent size="xl" className="p-0 overflow-hidden">
          <JmDialogTitle className="sr-only">
            {previewItem?.title ?? "미디어 미리보기"}
          </JmDialogTitle>
          {previewItem?.type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewItem.url}
              alt={previewItem.title ?? ""}
              className="w-full max-h-[85vh] object-contain bg-black"
            />
          ) : previewItem ? (
            (() => {
              const yid = extractYoutubeId(previewItem.url);
              return yid ? (
                <div className="aspect-video w-full bg-black">
                  <iframe
                    title={previewItem.title ?? "youtube"}
                    src={`https://www.youtube.com/embed/${yid}?autoplay=1`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="size-full"
                  />
                </div>
              ) : (
                <div className="p-8 text-center text-[var(--jm-text-muted)] text-jm-sm">
                  유효하지 않은 URL 입니다
                </div>
              );
            })()
          ) : null}
          {previewItem?.title && (
            <div className="px-4 py-3 text-jm-sm border-t border-[var(--jm-border)] text-[var(--jm-text)]">
              {previewItem.title}
            </div>
          )}
        </JmDialogContent>
      </JmDialog>
    </div>
  );
}
