"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@/jm/lib/cn";

const sizeClasses = {
  xs: "size-6 text-jm-3xs",
  sm: "size-8 text-jm-2xs",
  md: "size-10 text-jm-sm",
  lg: "size-12 text-jm-md",
  xl: "size-16 text-jm-xl",
};

export interface JmAvatarProps
  extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  size?: keyof typeof sizeClasses;
  /** 이미지 URL */
  src?: string | null;
  /** 이름 — fallback 이니셜 자동 추출 (한글은 첫 글자, 영문은 첫 두 단어 이니셜) */
  name?: string;
  /** 직접 fallback 컨텐츠 지정 — name 보다 우선 */
  fallback?: React.ReactNode;
  alt?: string;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // 한글 (가-힣) — 첫 글자만
  if (/^[ㄱ-힝]/.test(trimmed)) return trimmed.charAt(0);
  // 영문 — 단어별 첫 글자 최대 2개
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/**
 * Avatar — 이미지 + 이니셜 fallback. 이미지 로딩 실패 / 미지정 시 이니셜 표시.
 */
export const JmAvatar = React.forwardRef<HTMLSpanElement, JmAvatarProps>(
  ({ className, size = "md", src, name, fallback, alt, ...props }, ref) => {
    const initials = fallback ?? (name ? getInitials(name) : "?");
    return (
      <AvatarPrimitive.Root
        ref={ref}
        className={cn(
          "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[var(--jm-surface-muted)] font-semibold text-[var(--jm-text-muted)]",
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {src && (
          <AvatarPrimitive.Image
            src={src}
            alt={alt ?? name ?? ""}
            className="h-full w-full object-cover"
          />
        )}
        <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center">
          {initials}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
    );
  },
);
JmAvatar.displayName = "JmAvatar";
