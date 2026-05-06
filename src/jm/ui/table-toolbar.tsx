import * as React from "react";
import { cn } from "@/jm/lib/cn";

/**
 * 테이블 상단의 검색·필터·액션 툴바.
 * 자식 노드를 그대로 flex-wrap 컨테이너에 배치한다.
 *
 * 권장 구성:
 *  - 좌측: <JmSearchInput />
 *  - 가운데: <JmTableToolbarFilters>...filter pill / dropdown...</JmTableToolbarFilters>
 *  - 우측: <JmTableToolbarActions>...action buttons...</JmTableToolbarActions>
 */
export const JmTableToolbar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-3 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3",
      className,
    )}
    {...props}
  />
));
JmTableToolbar.displayName = "JmTableToolbar";

/** 검색 input 슬롯 — 자유 폭 + max-w 제한. */
export const JmTableToolbarSearch = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("min-w-0 flex-1 sm:max-w-xs", className)}
    {...props}
  />
));
JmTableToolbarSearch.displayName = "JmTableToolbarSearch";

/** 필터 chip / dropdown 묶음. 가로 스크롤 가능 (모바일 대응). */
export const JmTableToolbarFilters = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-2",
      className,
    )}
    {...props}
  />
));
JmTableToolbarFilters.displayName = "JmTableToolbarFilters";

/** 우측 액션 버튼 그룹 — 자동으로 ml-auto. */
export const JmTableToolbarActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ml-auto flex items-center gap-2", className)}
    {...props}
  />
));
JmTableToolbarActions.displayName = "JmTableToolbarActions";
