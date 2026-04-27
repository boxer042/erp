"use client";

import { useState } from "react";
import { LabelsView, TemplatesView } from "./_parts";

type View = "templates" | "labels";

export default function AssemblyTemplatesPage() {
  const [view, setView] = useState<View>("templates");

  return (
    <div className="flex h-full">
      <aside className="w-[180px] shrink-0 border-r border-border flex flex-col bg-sidebar">
        <div className="px-3 py-3 text-xs text-muted-foreground font-medium">
          조립템플릿
        </div>
        <nav className="flex flex-col px-2 gap-0.5">
          <SidebarItem active={view === "templates"} onClick={() => setView("templates")}>
            템플릿 관리
          </SidebarItem>
          <SidebarItem active={view === "labels"} onClick={() => setView("labels")}>
            슬롯라벨 관리
          </SidebarItem>
        </nav>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        {view === "templates" ? <TemplatesView /> : <LabelsView />}
      </main>
    </div>
  );
}

function SidebarItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
        active
          ? "bg-secondary text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
