"use client";

import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

export function GlobalLoadingBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  // 짧은 작업의 깜빡임 방지: 200ms 이상 지속될 때만 표시
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed left-0 right-0 top-11 z-40 h-0.5 overflow-hidden bg-transparent pointer-events-none"
    >
      <div className="h-full w-1/3 bg-primary global-loading-bar-anim" />
    </div>
  );
}
