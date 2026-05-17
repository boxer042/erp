"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * 모바일 전용 KPI section 토글.
 * - 데스크톱 (md+): 토글 버튼 숨김, 내용 항상 grid 로 표시
 * - 모바일: 토글 버튼 노출, 기본 collapsed. 클릭 시 펼침
 */
export function CollapsibleKpiSection({
  label,
  children,
  cols = 4,
}: {
  label: string;
  children: React.ReactNode;
  /** 데스크톱 컬럼 수 (기본 4) */
  cols?: 4 | 5;
}) {
  const [open, setOpen] = useState(false);
  const colClass = cols === 5 ? "md:grid-cols-5" : "md:grid-cols-4";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] px-3 py-2 text-jm-xs font-medium text-[var(--jm-text-muted)] transition-colors hover:bg-[var(--jm-surface-muted)] md:hidden"
      >
        {open ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
        {open ? "접기" : label}
      </button>
      <div
        className={`gap-3 md:grid ${colClass} ${open ? "grid grid-cols-2" : "hidden md:grid"}`}
      >
        {children}
      </div>
    </>
  );
}
