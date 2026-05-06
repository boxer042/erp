import * as React from "react";
import { cn } from "@/jm/lib/cn";

const widthClasses = {
  /** 768px — 모바일/태블릿 우선 콘텐츠. 단일 폼·읽기 위주 페이지 */
  narrow: "max-w-3xl",
  /** 1024px — 좁은 대시보드, 단일 폼 + 사이드 정보 */
  compact: "max-w-5xl",
  /** 1280px — 일반 대시보드 페이지 (기본값). 와이드 모니터에서 시선 이동 부담 적음 */
  default: "max-w-7xl",
  /** 1536px — 데이터 밀도 높은 페이지 (큰 테이블·리포트) */
  wide: "max-w-[1536px]",
  /** 제한 없음. POS 처럼 의도적으로 풀폭 */
  full: "",
};

export interface JmContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof widthClasses;
  /** 좌우 padding 자동 적용. false 면 padding 0. 기본 true */
  padded?: boolean;
  /** 가운데 정렬 여부. 기본 true. full 일 땐 무의미 */
  centered?: boolean;
  /** as prop — main / section / div. 기본 div */
  as?: React.ElementType;
}

/**
 * 페이지 폭을 일관되게 제한하는 컨테이너.
 *
 * **기본값은 `full`** — 별도 지정 안 하면 풀폭. POS 정책과 동일한 디폴트.
 * 데스크톱 대시보드처럼 좁히고 싶을 때만 명시적으로 width 지정.
 *
 * 사용처별 권장:
 * - POS·풀폭 (기본): <JmContainer> 또는 그냥 미사용
 * - 일반 대시보드: <JmContainer width="default"> (1280px)
 * - 단일 폼·읽기 페이지: <JmContainer width="narrow"> (768px)
 * - 큰 테이블·리포트: <JmContainer width="wide"> (1536px)
 *
 *   <JmContainer width="default" as="main">
 *     <h1>...</h1>
 *     ...
 *   </JmContainer>
 */
export const JmContainer = React.forwardRef<HTMLDivElement, JmContainerProps>(
  (
    {
      className,
      width = "full",
      padded = true,
      centered = true,
      as: Component = "div",
      ...props
    },
    ref,
  ) => (
    <Component
      ref={ref}
      className={cn(
        "w-full",
        centered && "mx-auto",
        padded && "px-4 sm:px-6",
        widthClasses[width],
        className,
      )}
      {...props}
    />
  ),
);
JmContainer.displayName = "JmContainer";
