"use client";

import { useRef, useState } from "react";
import { ImagePlus, X, Loader2 } from "lucide-react";
import Image from "next/image";

import { jmToast as toast, JmIconButton } from "@/jm";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  /** 최대 업로드 개수 — 기본 8 */
  max?: number;
}

/**
 * UsedItem 사진 업로드 컴포넌트.
 * 단순화: URL 배열만 관리. Supabase 업로드는 /api/used-items/upload 위임.
 * 삭제는 UI 에서만 제거 (Supabase 파일 삭제는 옵션 — 우선 누락).
 */
export function UsedItemImageUpload({
  value,
  onChange,
  disabled,
  max = 8,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (value.length + files.length > max) {
      toast.error(`최대 ${max}장까지 업로드 가능합니다`);
      return;
    }

    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/used-items/upload", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "업로드 실패");
        }
        const data = await res.json();
        newUrls.push(data.url);
      }
      onChange([...value, ...newUrls]);
      toast.success(`${newUrls.length}장 업로드 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드에 실패했습니다");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url, idx) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)]"
          >
            <Image
              src={url}
              alt={`사진 ${idx + 1}`}
              fill
              sizes="120px"
              className="object-cover"
              unoptimized
            />
            {!disabled && (
              <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                <JmIconButton
                  size="sm"
                  aria-label="삭제"
                  onClick={() => removeAt(idx)}
                  className="bg-[var(--jm-surface)]/90 shadow"
                >
                  <X className="size-3.5" />
                </JmIconButton>
              </div>
            )}
          </div>
        ))}

        {!disabled && value.length < max && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface)] disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="size-5" />
                <span>추가</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {value.length === 0 && !uploading && (
        <p className="text-jm-xs text-[var(--jm-text-muted)]">
          최대 {max}장. JPG/PNG/WebP/GIF 10MB 이하.
        </p>
      )}
    </div>
  );
}
