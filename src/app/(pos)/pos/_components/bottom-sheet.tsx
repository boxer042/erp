"use client";

import { useEffect } from "react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 시트 최대 높이. 기본 92vh */
  maxHeight?: string;
  /** 백드롭 클릭 / ESC 잠금 */
  locked?: boolean;
  /** 좌상단 뒤로가기 버튼 — 제공 시 헤더에 노출. 닫기(X)와 별개 동작 */
  onBack?: () => void;
}

/**
 * 공통 바텀 시트 — shadcn 0개. iOS/Android 표준 패턴.
 * - 백드롭 + blur
 * - 핸들 (드래그 X, 시각적)
 * - 풋터 sticky + safe-area-inset-bottom
 * - open=false 면 즉시 언마운트 → 내부 state 리셋
 */
export function BottomSheet(props: Props) {
  if (!props.open) return null;
  return <Body {...props} />;
}

function Body({
  onOpenChange,
  title,
  children,
  footer,
  maxHeight = "92vh",
  locked,
  onBack,
}: Props) {
  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpenChange, locked]);

  // 뒷 페이지 스크롤 차단
  useBodyScrollLock();

  return (
    <>
      <button
        type="button"
        onClick={() => !locked && onOpenChange(false)}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        aria-label="닫기"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-[var(--jm-surface)] shadow-2xl"
        style={{ maxHeight }}
      >
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1 w-10 rounded-full bg-[var(--jm-border-strong)]" />
        </div>
        {title && (
          <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-3">
            {onBack && (
              <button
                type="button"
                onClick={() => !locked && onBack()}
                disabled={locked}
                className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] disabled:opacity-50"
                aria-label="뒤로"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M12 4l-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
            <h2 className="flex-1 text-[18px] font-bold text-[var(--jm-text)]">{title}</h2>
            <button
              type="button"
              onClick={() => !locked && onOpenChange(false)}
              disabled={locked}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--jm-text-subtle)] hover:bg-[var(--jm-surface-muted)] disabled:opacity-50"
              aria-label="닫기"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M5 5l10 10M15 5l-10 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[var(--jm-border)] bg-[var(--jm-surface)] px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
