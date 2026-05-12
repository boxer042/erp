import "@/jm/tokens.css";
import { requireAuth } from "@/lib/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SidebarProvider } from "@/components/layout/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardShell user={{ name: user.name, email: user.email }}>
          {children}
        </DashboardShell>
      </div>
    </SidebarProvider>
  );
}
