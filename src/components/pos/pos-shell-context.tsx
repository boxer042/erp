"use client";

import { createContext, useContext } from "react";

export interface PosShellContextValue {
  /** 현재 컨텍스트의 활성 세션 ID — URL 우선, 없으면 sessions-context의 activeId, 없으면 첫 세션 */
  pickedSessionId: string;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  /** 상세페이지 미리보기 — productId 설정 시 Drawer 열림 */
  landingProductId: string | null;
  openLanding: (productId: string) => void;
  closeLanding: () => void;
}

export const PosShellContext = createContext<PosShellContextValue | null>(null);

export function usePosShell() {
  const ctx = useContext(PosShellContext);
  if (!ctx) throw new Error("usePosShell must be used within PosShell");
  return ctx;
}
