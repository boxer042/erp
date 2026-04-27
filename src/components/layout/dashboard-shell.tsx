"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 overflow-hidden">
      <AppSidebar />
      <main className="flex-1 min-h-0 min-w-0">
        <ScrollArea className="h-full">
          {children}
        </ScrollArea>
      </main>
    </div>
  );
}
