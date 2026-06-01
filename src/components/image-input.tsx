"use client";

import { useRef, useState } from "react";
import { Images, RectangleHorizontal, Square, X } from "lucide-react";
import { toast } from "sonner";

import { JmSourceDrawer } from "@/jm";
import { ImageEditDialog } from "@/components/image-edit-dialog";
import { MediaPickerDialog } from "@/components/media-picker-dialog";
import { cn } from "@/lib/utils";

// ── 맥락 → 업로드 엔드포인트 / 버킷 ──────────────────────────────
export type UploadContext =
  | "brand"
  | "category"
  | "channel"
  | "product"
  | "rental"
  | "used-item";

const UPLOAD_ENDPOINT: Record<UploadContext, string> = {
  brand: "/api/brands/upload",
  category: "/api/categories/upload",
  channel: "/api/channels/upload",
  product: "/api/products/upload",
  rental: "/api/products/upload",
  "used-item": "/api/used-items/upload",
};

const CONTEXT_BUCKET: Record<UploadContext, string> = {
  brand: "brand-logos",
  category: "category-images",
  channel: "channel-logos",
  product: "product-images",
  rental: "product-images",
  "used-item": "product-images",
};

const FREE_ASPECT = 16 / 9;

export type ImageChoice = "thumbnail" | "free" | "library";
export interface PickResult {
  url: string;
  path?: string;
  bucket: string;
}

async function uploadBlob(
  endpoint: string,
  data: Blob,
  name: string,
  bucket: string,
): Promise<PickResult | null> {
  const fd = new FormData();
  fd.append("file", data, name);
  const res = await fetch(endpoint, { method: "POST", body: fd });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    toast.error(err.error || "업로드 실패");
    return null;
  }
  const { url, path } = (await res.json()) as { url: string; path?: string };
  return { url, path, bucket };
}

// ── 하단 드로워: [1:1 썸네일] [자유] [라이브러리] ──────────────────
export interface ImagePickerDrawerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: UploadContext;
  allowThumbnail?: boolean;
  allowFree?: boolean;
  allowLibrary?: boolean;
  /** [1:1 썸네일] 선택 시 크롭 비율 (기본 1) */
  thumbnailAspect?: number;
  /** 업로드 다중 선택 허용 (상품/중고 다중 추가용) */
  multiple?: boolean;
  /** SVG 는 편집 건너뛰고 원본 업로드 (로고 맥락) */
  allowSvgRaw?: boolean;
  /** 선택 완료 — 업로드/라이브러리 결과 + 어떤 버튼으로 골랐는지 */
  onResult: (results: PickResult[], choice: ImageChoice) => void;
}

export function ImagePickerDrawer({
  open,
  onOpenChange,
  context,
  allowThumbnail = true,
  allowFree = true,
  allowLibrary = true,
  thumbnailAspect = 1,
  multiple = false,
  allowSvgRaw = false,
  onResult,
}: ImagePickerDrawerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<"thumbnail" | "free">("thumbnail");
  const resultsRef = useRef<PickResult[]>([]);
  const [queue, setQueue] = useState<File[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const endpoint = UPLOAD_ENDPOINT[context];
  const bucket = CONTEXT_BUCKET[context];
  const isSvg = (f: File) => f.type === "image/svg+xml";

  const reset = () => {
    resultsRef.current = [];
    setQueue([]);
    setQIndex(0);
  };

  const finalize = (choice: ImageChoice) => {
    const results = resultsRef.current;
    reset();
    onOpenChange(false);
    if (results.length) onResult(results, choice);
  };

  const startMode = (mode: "thumbnail" | "free") => {
    modeRef.current = mode;
    fileRef.current?.click();
  };

  const onFiles = async (list: FileList | null) => {
    if (fileRef.current) fileRef.current.value = ""; // 같은 파일 재선택 허용
    if (!list || list.length === 0) return;
    const files = multiple ? Array.from(list) : [list[0]];
    resultsRef.current = [];

    // SVG 원본 업로드 (로고) — 편집기 건너뜀
    const editables: File[] = [];
    if (allowSvgRaw) {
      setUploading(true);
      try {
        for (const f of files) {
          if (isSvg(f)) {
            const r = await uploadBlob(endpoint, f, f.name, bucket);
            if (r) resultsRef.current.push(r);
          } else {
            editables.push(f);
          }
        }
      } finally {
        setUploading(false);
      }
    } else {
      editables.push(...files);
    }

    if (editables.length === 0) {
      finalize(modeRef.current);
      return;
    }
    setQueue(editables);
    setQIndex(0);
  };

  const advance = () => {
    const next = qIndex + 1;
    if (next >= queue.length) finalize(modeRef.current);
    else setQIndex(next);
  };

  const handleConfirm = async (blob: Blob, name: string) => {
    setUploading(true);
    try {
      const r = await uploadBlob(endpoint, blob, name, bucket);
      if (r) resultsRef.current.push(r);
    } finally {
      setUploading(false);
    }
    advance();
  };

  const editFile = queue[qIndex] ?? null;
  const lockAspect = modeRef.current === "thumbnail";
  const defaultAspect = modeRef.current === "thumbnail" ? thumbnailAspect : FREE_ASPECT;

  return (
    <>
      <JmSourceDrawer
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
        title="이미지 추가"
        options={[
          {
            icon: <Square />,
            title: "1:1 썸네일",
            desc: "정사각형으로 잘라 업로드 (카드·리스트용)",
            disabled: !allowThumbnail || uploading,
            onSelect: () => startMode("thumbnail"),
          },
          {
            icon: <RectangleHorizontal />,
            title: "자유 비율",
            desc: "원하는 비율로 잘라 업로드 (상세·배너용)",
            disabled: !allowFree || uploading,
            onSelect: () => startMode("free"),
          },
          {
            icon: <Images />,
            title: "라이브러리",
            desc: "이미 올린 사진에서 선택",
            disabled: !allowLibrary || uploading,
            onSelect: () => setPickerOpen(true),
          },
        ]}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <ImageEditDialog
        open={editFile !== null}
        file={editFile}
        defaultAspect={defaultAspect}
        lockAspect={lockAspect}
        onConfirm={handleConfirm}
        onCancel={advance}
      />

      <MediaPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(sel) => {
          setPickerOpen(false);
          resultsRef.current = [{ url: sel.url, path: sel.path, bucket: sel.bucket }];
          finalize("library");
        }}
      />
    </>
  );
}

// ── 단일 이미지 입력 (미리보기 박스 + 드로워) ──────────────────────
export interface ImageInputProps {
  value: string | null;
  onChange: (next: string | null) => void;
  context: UploadContext;
  allowThumbnail?: boolean;
  allowFree?: boolean;
  allowLibrary?: boolean;
  thumbnailAspect?: number;
  allowSvgRaw?: boolean;
  /** 버킷 path 도 따로 보존하는 소비처용 (브랜드/카테고리/채널) */
  onPathChange?: (path: string | null) => void;
  disabled?: boolean;
  /** 미리보기 박스 한 변 px (기본 96) */
  size?: number;
  className?: string;
}

export function ImageInput({
  value,
  onChange,
  context,
  allowThumbnail = true,
  allowFree = true,
  allowLibrary = true,
  thumbnailAspect = 1,
  allowSvgRaw,
  onPathChange,
  disabled,
  size = 96,
  className,
}: ImageInputProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const box = { width: size, height: size } as const;

  const handleResult = (results: PickResult[]) => {
    const first = results[0];
    if (!first) return;
    onChange(first.url);
    onPathChange?.(first.path ?? null);
  };

  return (
    <div className={cn("shrink-0", className)}>
      <div className="relative" style={box}>
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="이미지"
              onClick={() => !disabled && setDrawerOpen(true)}
              title="클릭하여 변경"
              className="size-full cursor-pointer rounded-lg border border-[var(--jm-border)] object-cover"
              style={box}
            />
            <button
              type="button"
              onClick={() => {
                onChange(null);
                onPathChange?.(null);
              }}
              disabled={disabled}
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--jm-danger-solid)] text-white shadow transition-transform hover:scale-110 disabled:opacity-50"
              aria-label="이미지 제거"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            disabled={disabled}
            className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface)] disabled:opacity-50"
            style={box}
            aria-label="이미지 추가"
          >
            <Images className="size-5" />
            <span className="text-jm-2xs">사진 추가</span>
          </button>
        )}
      </div>

      <ImagePickerDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        context={context}
        allowThumbnail={allowThumbnail}
        allowFree={allowFree}
        allowLibrary={allowLibrary}
        thumbnailAspect={thumbnailAspect}
        allowSvgRaw={allowSvgRaw}
        onResult={handleResult}
      />
    </div>
  );
}
