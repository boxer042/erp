"use client";

import { useTheme } from "next-themes";
import { AppSidebar, type AppSidebarUser } from "@/components/layout/app-sidebar";
import { JmSidebarTrigger, JmBrandMark, JmScope } from "@/jm";
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
      <AppSidebar user={user} />
      <main className="flex flex-1 min-h-0 min-w-0 flex-col">
        {/* 모바일 전용 상단 바 — 데스크톱은 사이드바 헤더가 그 역할 */}
        <JmScope
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          className="contents sm:hidden print:hidden"
        >
          <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-3">
            <JmSidebarTrigger />
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
