"use client";

import { JmInput } from "@/jm";
import { ImageInput } from "@/components/image-input";

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** 미리보기 정사각형 높이 (px). 기본 80 */
  size?: number;
}

export function ImageUploadField({ value, onChange, size = 80 }: ImageUploadFieldProps) {
  return (
    <div className="flex items-start gap-3">
      <ImageInput
        value={value || null}
        onChange={(u) => onChange(u ?? "")}
        context="product"
        size={size}
      />
      <div className="flex flex-1 flex-col gap-2">
        <JmInput
          placeholder="또는 이미지 URL 직접 입력"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
