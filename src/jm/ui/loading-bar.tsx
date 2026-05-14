"use client";

import * as React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { cn } from "@/jm/lib/cn";

/**
 * 화면 최상단 fixed 진행 표시 바. React Query 의 `useIsFetching`/`useIsMutating`
 * 합산이 0 보다 크면 200ms 후 노출 (깜빡임 방지). 활동 종료 시 즉시 사라짐.
 *
 *   <JmLoadingBar />
 *
 * 위치:
 *   기본 — top: 0, z-[60]. 페이지의 sticky 헤더와 같은 라인.
 *   `top` prop 으로 offset 조정 가능 (예: 모바일 헤더가 있을 때 헤더 아래).
 *
 * 색:
 *   bg   = var(--jm-surface-muted) (트랙)
 *   bar  = var(--jm-action) (진행 막대) — JmScope theme 따라 자동 다크 대응
 *
 * 깜빡임 방지:
 *   200ms threshold — 짧은 mutation 은 표시 안 됨.
 *
 * 단일 인스턴스만 마운트할 것 — 앱 루트 레이아웃에 한 번만 두면 모든 페이지 커버.
 */
export interface JmLoadingBarProps {
  /** 트랙 두께(px). 기본 2. */
  thickness?: number;
  /** top offset. 기본 0. */
  top?: number;
  /** 노출 지연(ms). 기본 200. */
  delayMs?: number;
  /** className 추가 — 위치/색 override 시. */
  className?: string;
}

export function JmLoadingBar({
  thickness = 2,
  top = 0,
  delayMs = 200,
  className,
}: JmLoadingBarProps) {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{ top, height: thickness }}
      className={cn(
        "pointer-events-none fixed inset-x-0 z-[60] overflow-hidden bg-[var(--jm-surface-muted)]",
        className,
      )}
    >
      <div className="jm-loading-bar-anim h-full w-1/3 bg-[var(--jm-action)]" />
    </div>
  );
}
JmLoadingBar.displayName = "JmLoadingBar";
