import * as React from "react";
import { cn } from "@/jm/lib/cn";

export type JmTheme = "light" | "dark" | "auto";

export interface JmScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 테마 모드 (선택). 생략하면 전역 테마(:root / host 의 .dark)를 그대로 상속한다.
   * 값을 주면 그 영역만 전역과 무관하게 고정(island):
   * - "light" — 라이트 강제
   * - "dark" — 다크 강제
   * - "auto" — prefers-color-scheme 따라감
   */
  theme?: JmTheme;
}

/**
 * jm 디자인 시스템 영역 마커.
 *
 * ⚠️ jm 토큰(--jm-*)은 이제 전역 :root / .dark 에 정의되므로 페이지를 JmScope 로 감쌀 필요가 없다
 * (shadcn / Radix 처럼 그냥 동작). JmScope 는 두 경우에만 쓴다:
 *  1) theme 를 지정해 특정 영역만 전역과 다른 테마로 고정 (island)
 *  2) bg/text/font 기본 클래스를 한 번에 까는 컨테이너가 필요할 때
 */
export function JmScope({
  children,
  className,
  theme,
  ...rest
}: JmScopeProps) {
  return (
    <div
      data-jm-scope
      {...(theme ? { "data-jm-theme": theme } : {})}
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
