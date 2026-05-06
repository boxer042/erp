import * as React from "react";
import { cn } from "@/jm/lib/cn";

export type JmTheme = "light" | "dark" | "auto";

export interface JmScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 테마 모드.
   * - "light" (기본) — 라이트 토큰 강제
   * - "dark" — 다크 토큰 강제
   * - "auto" — prefers-color-scheme 따라감
   */
  theme?: JmTheme;
}

/**
 * jm 디자인 시스템의 토큰 적용 영역.
 * 이 wrapper 안에서만 --jm-* 토큰이 살아있다.
 * 라우트 layout 또는 페이지 루트에 한 번 두면 된다.
 */
export function JmScope({
  children,
  className,
  theme = "light",
  ...rest
}: JmScopeProps) {
  return (
    <div
      data-jm-scope
      data-jm-theme={theme}
      className={cn(
        "bg-[var(--jm-bg)] text-[var(--jm-text)] font-[family-name:var(--jm-font-sans)] antialiased",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
