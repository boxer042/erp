"use client";

import { useState } from "react";
import { LabelsView, TemplatesView } from "./_parts";
import { ProductsThemeScope } from "../_theme-scope";

type View = "templates" | "labels";

export default function AssemblyTemplatesPage() {
  const [view, setView] = useState<View>("templates");

  return (
    <ProductsThemeScope>
      <div className="flex h-full">
        <aside
          className="w-[180px] shrink-0 flex flex-col"
          style={{
            borderRight: "1px solid var(--jm-border)",
            background: "var(--jm-surface)",
          }}
        >
          <div
            className="px-3 py-3 text-xs font-medium"
            style={{ color: "var(--jm-text-muted)" }}
          >
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

        <main className="flex-1 min-w-0 flex flex-col bg-[var(--jm-bg)]">
          {view === "templates" ? <TemplatesView /> : <LabelsView />}
        </main>
      </div>
    </ProductsThemeScope>
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
      className="text-left text-sm px-3 py-1.5 rounded-md transition-colors"
      style={
        active
          ? {
              background: "var(--jm-surface-muted)",
              color: "var(--jm-text)",
              fontWeight: 500,
            }
          : {
              color: "var(--jm-text-muted)",
            }
      }
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "var(--jm-surface-muted)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--jm-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = "";
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--jm-text-muted)";
        }
      }}
    >
      {children}
    </button>
  );
}
