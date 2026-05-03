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

  return (
    <PosShellContext.Provider value={value}>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Suspense
          fallback={<div className="w-[88px] shrink-0 border-r border-border bg-card" />}
        >
          <PosSidebar />
        </Suspense>
        <div className="flex flex-1 flex-col overflow-hidden">
          <PosCustomerHeader />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>

      <SearchDialog />
      <CartDrawer />
    </PosShellContext.Provider>
  );
}
