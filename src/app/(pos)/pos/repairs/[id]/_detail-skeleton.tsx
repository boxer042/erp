"use client";

import { ArrowLeft } from "lucide-react";
import { JmCard, JmIconButton, JmSkeleton } from "@/jm";

/** 수리 상세 페이지 로딩 스켈레톤 — 실제 페이지 골격과 동일한 카드 수·높이로 layout shift 최소화. */
export function DetailSkeleton({
  onBack,
  hideHeader,
}: {
  onBack: () => void;
  hideHeader?: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-[var(--jm-bg)]">
      {!hideHeader && (
        <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            <JmIconButton size="md" variant="ghost" onClick={onBack} aria-label="뒤로">
              <ArrowLeft className="size-5" />
            </JmIconButton>
            <div className="flex flex-1 flex-col gap-1">
              <JmSkeleton className="h-3 w-20" />
              <JmSkeleton className="h-3 w-32" />
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 sm:p-6">
          <JmCard className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <JmSkeleton className="h-3 w-12" />
              <JmSkeleton className="h-4 w-20" />
            </div>
            <div className="flex items-center justify-between">
              <JmSkeleton className="h-3 w-16" />
              <JmSkeleton className="h-4 w-16" />
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[var(--jm-border)] pt-2">
              <JmSkeleton className="h-4 w-16" />
              <JmSkeleton className="h-5 w-24" />
            </div>
          </JmCard>
          <JmCard className="flex flex-col gap-2 p-4">
            <JmSkeleton className="h-3 w-16" />
            <JmSkeleton className="h-4 w-2/3" />
            <JmSkeleton className="h-3 w-1/3" />
          </JmCard>
          {Array.from({ length: 2 }).map((_, i) => (
            <JmCard key={i} className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <JmSkeleton className="h-4 w-12" />
                <JmSkeleton className="h-7 w-16 rounded-full" />
              </div>
              <JmSkeleton className="h-3 w-full" />
              <JmSkeleton className="h-3 w-2/3" />
            </JmCard>
          ))}
        </div>
      </main>
    </div>
  );
}
