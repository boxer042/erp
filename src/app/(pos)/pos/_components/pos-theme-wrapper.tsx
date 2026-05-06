"use client";

import * as React from "react";
import { JmScope, type JmTheme } from "@/jm";

const STORAGE_KEY = "pos-theme";

/**
 * POS 테마 컨텍스트 — 라이트/다크/auto 토글 + localStorage 영구 저장.
 * 메뉴 시트의 테마 토글에서 useContext 로 접근.
 */
interface ThemeCtx {
  theme: JmTheme;
  setTheme: (theme: JmTheme) => void;
}

const PosThemeContext = React.createContext<ThemeCtx | null>(null);

export function usePosTheme(): ThemeCtx {
  const ctx = React.useContext(PosThemeContext);
  if (!ctx) {
    throw new Error("usePosTheme must be used inside <PosThemeWrapper>");
  }
  return ctx;
}

export function PosThemeWrapper({ children }: { children: React.ReactNode }) {
  // 첫 렌더에선 SSR/클라이언트 일치 위해 light 로 시작, 이후 localStorage 값으로 교체
  const [theme, setThemeState] = React.useState<JmTheme>("light");
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as JmTheme | null;
      if (saved === "light" || saved === "dark" || saved === "auto") {
        setThemeState(saved);
      }
    } catch {
      // localStorage 차단 환경 — 무시
    }
    setHydrated(true);
  }, []);

  const setTheme = React.useCallback((next: JmTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 무시
    }
  }, []);

  // hydration 전엔 light 로 렌더 (FOUC 방지)
  return (
    <PosThemeContext.Provider value={{ theme, setTheme }}>
      <JmScope theme={hydrated ? theme : "light"} className="contents">
        {children}
      </JmScope>
    </PosThemeContext.Provider>
  );
}
