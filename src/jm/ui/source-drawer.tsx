"use client";

import * as React from "react";
import { cn } from "@/jm/lib/cn";
import {
  JmDrawer,
  JmDrawerContent,
  JmDrawerHeader,
  JmDrawerTitle,
} from "./drawer";

export interface JmSourceOption {
  /** 좌측 아이콘 (lucide 권장 — size-4.5 로 정규화됨) */
  icon: React.ReactNode;
  /** 제목 */
  title: string;
  /** 보조 설명 (선택) */
  desc?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface JmSourceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 헤더 제목 (없으면 헤더 생략) */
  title?: React.ReactNode;
  /** 옵션 리스트 — 각 항목은 자기가 무엇을 하는지 모름 (onSelect 콜백만 호출) */
  options: JmSourceOption[];
  /** JmDrawerContent size (기본 sm) */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

/**
 * 하단에서 올라오는 "소스 선택" 시트.
 *
 * 버튼 클릭 → 바텀 드로워 → 옵션 N개(아이콘 + 제목 + 설명) 리스트.
 * 각 옵션이 *무엇을* 하는지는 모르는 헤드리스 컴포넌트 — onSelect 콜백만 호출한다.
 * 이미지 추가, 내보내기 형식 선택, 공유 대상 선택 등 범용으로 재사용.
 *
 * @example
 * <JmSourceDrawer
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="이미지 추가"
 *   options={[
 *     { icon: <Square />, title: "1:1 썸네일", desc: "정사각형 크롭", onSelect: pickThumb },
 *     { icon: <Images />, title: "라이브러리", desc: "이미 올린 사진", onSelect: openLibrary },
 *   ]}
 * />
 */
export function JmSourceDrawer({
  open,
  onOpenChange,
  title,
  options,
  size = "sm",
  className,
}: JmSourceDrawerProps) {
  return (
    <JmDrawer open={open} onOpenChange={onOpenChange}>
      <JmDrawerContent
        side="bottom"
        size={size}
        className={cn("p-0", className)}
      >
        {title != null && (
          <JmDrawerHeader className="px-5 py-4">
            <JmDrawerTitle>{title}</JmDrawerTitle>
          </JmDrawerHeader>
        )}
        <div className="flex flex-col gap-2 px-5 pb-6 pt-4">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={opt.onSelect}
              disabled={opt.disabled}
              className="flex items-center gap-3 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--jm-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--jm-surface-muted)] text-[var(--jm-text)] [&_svg]:size-4.5">
                {opt.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-jm-sm font-semibold text-[var(--jm-text)]">
                  {opt.title}
                </span>
                {opt.desc && (
                  <span className="block text-jm-xs text-[var(--jm-text-muted)]">
                    {opt.desc}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </JmDrawerContent>
    </JmDrawer>
  );
}
