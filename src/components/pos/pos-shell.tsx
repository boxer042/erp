"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useSessions } from "@/components/pos/sessions-context";
import { PosSidebar } from "@/components/pos/pos-sidebar";
import { PosCustomerHeader } from "@/components/pos/pos-customer-header";
import { SearchDialog } from "@/components/pos/search-dialog";
import { CartDrawer } from "@/components/pos/cart-drawer";
import { PosShellContext, type PosShellContextValue } from "@/components/pos/pos-shell-context";

function getSessionIdFromPath(pathname: string): string {
  const m = pathname.match(/^\/pos\/cart\/([^/]+)/);
  return m?.[1] ?? "";
}

export function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sessions, activeId } = useSessions();

  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const pickedSessionId = useMemo(() => {
    const fromUrl = getSessionIdFromPath(pathname);
    if (fromUrl && sessions.find((s) => s.id === fromUrl)) return fromUrl;
    if (activeId && sessions.find((s) => s.id === activeId)) return activeId;
    return sessions[0]?.id ?? "";
  }, [pathname, sessions, activeId]);

  // 라우트 변경 시 드로워/다이얼로그 닫기
  useEffect(() => {
    setCartOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const value: PosShellContextValue = {
    pickedSessionId,
    searchOpen,
    setSearchOpen: useCallback((o: boolean) => setSearchOpen(o), []),
    cartOpen,
    setCartOpen: useCallback((o: boolean) => setCartOpen(o), []),
  };

  // v2 진입 시 기존 88px 사이드바 숨김 — v2 페이지 내부의 햄버거/하단탭이 담당
  const isV2 = pathname.startsWith("/pos/v2");

  return (
    <PosShellContext.Provider value={value}>
      {/*
        h-dvh = 동적 뷰포트 높이 (iOS Safari 주소창 보일 때/안 보일 때 자동 조정).
        h-screen(=100vh) 은 주소창 무시하고 큰 값이라 모바일에서 하단이 잘림.
      */}
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        {!isV2 && (
          <Suspense
            fallback={<div className="w-[88px] shrink-0 border-r border-border bg-card" />}
          >
            <PosSidebar />
          </Suspense>
        )}
        {/*
          flex-row 의 flex-1 자식엔 min-w-0 — 콘텐츠 폭이 부모 넘쳐 좌측 가로 스크롤 생기는 것 방지.
          내부 main 도 flex-col 안의 flex-1 → min-h-0 (콘텐츠 길이로 부모 넘침 방지).
        */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PosCustomerHeader />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
        </div>
      </div>

      <SearchDialog />
      <CartDrawer />
    </PosShellContext.Provider>
  );
}
