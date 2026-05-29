"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { ImageEditDialog } from "@/components/image-edit-dialog";
import { cn } from "@/lib/utils";

interface Props {
  /** 현재 이미지 URL (없으면 null) */
  value: string | null;
  /** 업로드 완료 / 제거 시 호출 — 새 URL 또는 null */
  onChange: (url: string | null) => void;
  disabled?: boolean;
  /** 크롭 비율 (가로/세로). 기본 1 (정사각형 썸네일) */
  aspect?: number;
  /** 박스 한 변 px. 기본 96 (size-24) */
  size?: number;
  className?: string;
}

/**
 * 단일 썸네일 업로드 — 상품 미디어와 동일한 편집 경험(크롭·회전·배경제거)을 재사용.
 * 파일 선택 → ImageEditDialog 편집 → /api/products/upload 업로드 → onChange(url).
 *
 * 모바일에서 바로 촬영할 수 있도록 카메라 버튼(capture)을 별도로 제공한다.
 * 데스크탑에선 capture 가 무시되어 일반 파일 선택으로 폴백된다.
 */
export function ThumbnailUpload({
  value,
  onChange,
  disabled,
  aspect = 1,
  size = 96,
  className,
}: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editFile, setEditFile] = useState<File | null>(null);

  const box = { width: size, height: size } as const;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (f) setEditFile(f);
  };

  const handleConfirm = async (blob: Blob, name: string) => {
    setEditFile(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, name);
      const res = await fetch("/api/products/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "업로드 실패");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("shrink-0", className)}>
      <div className="relative" style={box}>
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="썸네일"
              onClick={() => { if (!disabled && !uploading) galleryRef.current?.click(); }}
              title="클릭하여 갤러리에서 변경"
              className="size-full cursor-pointer rounded-lg border border-[var(--jm-border)] object-cover"
              style={box}
            />
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--jm-danger-solid)] text-white shadow transition-transform hover:scale-110 disabled:opacity-50"
              aria-label="이미지 제거"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={disabled || uploading}
            className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface)] disabled:opacity-50"
            style={box}
            aria-label="이미지 선택"
          >
            <ImagePlus className="size-5" />
            <span className="text-jm-2xs">사진 추가</span>
          </button>
        )}

        {/* 카메라 — 터치 기기(coarse pointer)에서만 노출해 바로 촬영. 데스크탑은 갤러리/파일 선택(박스·이미지 클릭)으로 충분 */}
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || uploading}
          className="absolute -bottom-1.5 -right-1.5 hidden size-6 items-center justify-center rounded-full border border-[var(--jm-border)] bg-[var(--jm-surface)] text-[var(--jm-text)] shadow transition-transform hover:scale-110 disabled:opacity-50 pointer-coarse:flex"
          aria-label="촬영"
        >
          <Camera className="size-3.5" />
        </button>

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        )}
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      <ImageEditDialog
        open={!!editFile}
        file={editFile}
        defaultAspect={aspect}
        lockAspect
        onConfirm={handleConfirm}
        onCancel={() => setEditFile(null)}
      />
    </div>
  );
}
