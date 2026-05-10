"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/jm/lib/cn";
import { JmButton } from "./button";
import { JmBadge } from "./badge";
import {
  JmDrawer,
  JmDrawerBody,
  JmDrawerContent,
  JmDrawerFooter,
  JmDrawerHeader,
  JmDrawerTitle,
} from "./drawer";

/**
 * 테이블 상단 툴바 — CSS Grid 기반 반응형.
 *
 *   모바일 (< sm)             데스크톱 (sm+)
 *   ┌──────────────────┐      ┌──────────────────────────────────┐
 *   │ search   search  │      │ search  filters       actions    │
 *   │ filters  actions │      └──────────────────────────────────┘
 *   └──────────────────┘
 *
 * 슬롯:
 *   <JmTableToolbarSearch>  검색. 모바일 풀폭, 데스크톱 200~320px
 *   <JmTableToolbarFilters> pill 가로 스크롤 영역 (wrap 안 함)
 *   <JmTableToolbarActions> primary CTA + secondary icon button (우측 정렬)
 *   <JmTableToolbarMore>    데스크톱: 인라인. 모바일: [필터 N] 버튼 → bottom drawer
 *                            (filters 안쪽에 둔다 — 폭 큰 select 묶음 용도)
 */
export const JmTableToolbar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid items-center gap-y-2 gap-x-3 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3",
      // mobile: 2행 — search 가 두 칼럼 span, filters/actions 가 둘째 행
      "[grid-template-areas:'search_search'_'filters_actions']",
      "[grid-template-columns:minmax(0,1fr)_auto]",
      // sm+: 1행 — search / filters / actions
      "sm:[grid-template-areas:'search_filters_actions']",
      "sm:[grid-template-columns:minmax(200px,320px)_minmax(0,1fr)_auto]",
      className,
    )}
    {...props}
  />
));
JmTableToolbar.displayName = "JmTableToolbar";

/** 검색 슬롯 — grid-area: search. 모바일 풀폭, 데스크톱 220~360px. */
export const JmTableToolbarSearch = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ gridArea: "search", ...style }}
    className={cn("min-w-0", className)}
    {...props}
  />
));
JmTableToolbarSearch.displayName = "JmTableToolbarSearch";

/**
 * 필터/칩 슬롯 — grid-area: filters.
 * 가로 스크롤(wrap 안 함). JmPill 은 자체 shrink-0 보유.
 * 폭 큰 select 는 JmTableToolbarMore 로 감싸서 넣을 것.
 */
export const JmTableToolbarFilters = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ gridArea: "filters", ...style }}
    className={cn(
      "flex min-w-0 items-center gap-2 overflow-x-auto",
      // 스크롤바 숨김 (가로 스크롤은 시각적으로만)
      "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      // 직속 자식은 shrink 안 함 (JmSelect 같이 width 가 명시 안 된 컴포넌트 보호)
      "[&>*]:shrink-0",
      className,
    )}
    {...props}
  />
));
JmTableToolbarFilters.displayName = "JmTableToolbarFilters";

/** 우측 액션 슬롯 — grid-area: actions. */
export const JmTableToolbarActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => (
  <div
    ref={ref}
    style={{ gridArea: "actions", ...style }}
    className={cn(
      "flex shrink-0 items-center justify-end gap-2",
      className,
    )}
    {...props}
  />
));
JmTableToolbarActions.displayName = "JmTableToolbarActions";

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export interface JmTableToolbarMoreProps {
  children?: React.ReactNode;
  /** 활성화된 필터 개수 — 0 보다 크면 모바일 버튼에 배지 노출. */
  count?: number;
  /** 모바일 트리거 버튼 라벨 (= drawer 제목). 기본 "필터". */
  label?: string;
  /** 초기화 콜백. 있으면 drawer footer 에 "초기화" 버튼 노출. */
  onReset?: () => void;
}

/**
 * 추가 필터 슬롯 — `<JmTableToolbarFilters>` 안쪽에 사용.
 *  - 데스크톱(sm+): children 을 그대로 인라인 노출
 *  - 모바일(< sm): [필터 N] 트리거 버튼 → bottom drawer 안에서 children 조작
 *
 * children 은 한 번만 마운트됨 (useMediaQuery 분기). 초기 1프레임 동안 모바일 fallback 으로
 * 렌더되었다가 hydration 직후 데스크톱이면 인라인으로 전환.
 */
export function JmTableToolbarMore({
  children,
  count,
  label = "필터",
  onReset,
}: JmTableToolbarMoreProps) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = React.useState(false);
  const hasCount = typeof count === "number" && count > 0;

  if (isDesktop) {
    // fragment — children 이 filters flex 의 직접 자식이 됨 ([&>*]:shrink-0 적용)
    return <>{children}</>;
  }

  return (
    <>
      <JmButton
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <SlidersHorizontal className="size-4" />
        {label}
        {hasCount && (
          <JmBadge size="sm" variant="solid">
            {count}
          </JmBadge>
        )}
      </JmButton>
      <JmDrawer open={open} onOpenChange={setOpen}>
        <JmDrawerContent side="bottom" size="md">
          <JmDrawerHeader>
            <JmDrawerTitle>{label}</JmDrawerTitle>
          </JmDrawerHeader>
          <JmDrawerBody className="space-y-4">{children}</JmDrawerBody>
          <JmDrawerFooter>
            {onReset && (
              <JmButton variant="ghost" onClick={onReset}>
                초기화
              </JmButton>
            )}
            <JmButton onClick={() => setOpen(false)}>적용</JmButton>
          </JmDrawerFooter>
        </JmDrawerContent>
      </JmDrawer>
    </>
  );
}
JmTableToolbarMore.displayName = "JmTableToolbarMore";
