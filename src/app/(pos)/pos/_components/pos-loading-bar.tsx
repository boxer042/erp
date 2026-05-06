"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * POS 전용 로딩 진행 표시 — shadcn 0개, raw Tailwind.
 *
 * 위치: 화면 최상단 fixed (top-0). 페이지 헤더의 border-b 와는 독립이지만
 * 모든 POS 라우트가 화면 최상단부터 시작하므로 시각적으로 헤더 hairline 자리에 자연스럽게 얹힘.
 *
 * 깜빡임 방지: 200ms 이상 지속될 때만 노출.
 */
export function PosLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden bg-[var(--jm-surface-muted)]"
    >
      <div className="pos-loading-bar-anim h-full w-1/3 bg-[var(--jm-action)]" />
    </div>
  );
}
