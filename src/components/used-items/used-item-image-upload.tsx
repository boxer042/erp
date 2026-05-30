"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import Image from "next/image";

import { jmToast as toast, JmIconButton } from "@/jm";
import { ImagePickerDrawer, type PickResult } from "@/components/image-input";

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  /** 최대 업로드 개수 — 기본 8 */
  max?: number;
}

/**
 * UsedItem 사진 업로드 — URL 배열 관리.
 * 추가는 공용 ImagePickerDrawer([1:1]/[자유]/[라이브러리]) 위임.
 */
export function UsedItemImageUpload({
  value,
  onChange,
  disabled,
  max = 8,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleResult = (results: PickResult[]) => {
    const room = max - value.length;
    if (room <= 0) return;
    if (results.length > room) toast.error(`최대 ${max}장까지 업로드 가능합니다`);
    const urls = results.slice(0, room).map((r) => r.url);
    if (urls.length) onChange([...value, ...urls]);
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
            onClick={() => setDrawerOpen(true)}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-jm-xs text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface)]"
          >
            <ImagePlus className="size-5" />
            <span>추가</span>
          </button>
        )}
      </div>

      <ImagePickerDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        context="used-item"
        multiple
        onResult={handleResult}
      />

      {value.length === 0 && (
        <p className="text-jm-xs text-[var(--jm-text-muted)]">
          최대 {max}장. JPG/PNG/WebP/GIF 10MB 이하.
        </p>
      )}
    </div>
  );
}
