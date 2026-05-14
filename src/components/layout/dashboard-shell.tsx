"use client";

import { useTheme } from "next-themes";
import {
  AppSidebar,
  MobileSidebarTrigger,
  type AppSidebarUser,
} from "@/components/layout/app-sidebar";
import { JmBrandMark, JmLoadingBar, JmScope } from "@/jm";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DashboardShell({
  user,
  children,
}: {
  user: AppSidebarUser;
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 글로벌 로딩 바 — JmScope 안에서 토큰 받음, 화면 최상단 fixed */}
      <JmScope
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        className="contents"
      >
        <JmLoadingBar />
      </JmScope>
      <AppSidebar user={user} />
      <main className="flex flex-1 min-h-0 min-w-0 flex-col">
        {/* 모바일 전용 상단 바 — 데스크톱(lg+)은 사이드바 헤더가 그 역할.
            lg 미만 (폴드 내부/iPad 세로/폰 모두) 에선 사이드바가 overlay 라 별도 헤더 필요. */}
        <JmScope
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          className="sticky top-0 z-30 shrink-0 lg:hidden print:hidden"
        >
          <div className="flex h-12 items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-3">
            <MobileSidebarTrigger className="text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]" />
            <div className="flex items-center gap-2">
              <JmBrandMark text="JM" size="sm" />
              <span className="text-jm-sm font-bold tracking-tight text-[var(--jm-text)]">
                JAEWOOMADE
              </span>
            </div>
          </div>
        </JmScope>
        <ScrollArea className="flex-1 min-h-0">{children}</ScrollArea>
      </main>
    </div>
  );
}
