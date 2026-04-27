import { requireAuth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, MobileSidebarTrigger } from "@/components/layout/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <SidebarProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        {/* Global header — 전체 너비, 사이드바 위에 위치 */}
        <header className="flex h-11 shrink-0 items-center border-b border-border bg-card pl-2 pr-4 z-50 gap-2">
          <MobileSidebarTrigger />
          <div className="flex items-center gap-2.5 pl-1">
            <span className="text-[13px] font-medium text-foreground tracking-tight">JAEWOOMADE ERP</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2.5">
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-brand/20 text-brand text-[11px] font-medium">
                {user.name.charAt(0)}
              </div>
              <span className="hidden sm:inline text-[13px] text-muted-foreground">{user.name}</span>
            </div>
          </div>
        </header>

        {/* Below header: sidebar + content */}
        <DashboardShell>{children}</DashboardShell>
      </div>
    </SidebarProvider>
  );
}
