"use client";

import { useState } from "react";
import {
  JmTabs,
  JmTabsList,
  JmTabsTrigger,
} from "@/jm";
import { LabelsView, TemplatesView } from "./_parts";
import { ProductsThemeScope } from "../_theme-scope";

type View = "templates" | "labels";

export default function AssemblyTemplatesPage() {
  const [view, setView] = useState<View>("templates");

  return (
    <ProductsThemeScope>
      <div className="flex min-h-full flex-col bg-[var(--jm-bg)]">
        {/* 상단 탭 — sticky */}
        <div className="sticky top-0 z-10 bg-[var(--jm-bg)] px-4 pt-3">
          <JmTabs value={view} onValueChange={(v) => setView(v as View)}>
            <JmTabsList variant="line">
              <JmTabsTrigger value="templates">템플릿 관리</JmTabsTrigger>
              <JmTabsTrigger value="labels">슬롯라벨 관리</JmTabsTrigger>
            </JmTabsList>
          </JmTabs>
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          {view === "templates" ? <TemplatesView /> : <LabelsView />}
        </main>
      </div>
    </ProductsThemeScope>
  );
}
