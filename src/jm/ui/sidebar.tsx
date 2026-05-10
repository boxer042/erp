"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/jm/lib/cn";
import { JmScrollArea } from "./scroll-area";

/**
 * jm 사이드바 — 데스크톱 영구 노출 + 모바일 햄버거 → overlay drawer.
 *
 * 데스크톱 모드 3종 (shadcn app-sidebar 와 동일):
 *  - "expanded"        — 풀폭(width) 노출. layout 점유 = width
 *  - "collapsed"       — 좁은 폭(collapsedWidth) 아이콘 only. layout 점유 = collapsedWidth
 *  - "expand-on-hover" — layout 점유 = collapsedWidth, hover/focus 시 inner 만 width 로 떠 오름
 *                        (shadow + absolute overflow). 컨텐츠는 밀리지 않음
 *
 *   <JmSidebarProvider>
 *     <div className="flex h-screen">
 *       <JmSidebar>
 *         <JmSidebarHeader>...</JmSidebarHeader>
 *         <JmSidebarBody>
 *           <JmSidebarGroup label="메뉴">
 *             <JmSidebarItem icon={<Home/>} active>홈</JmSidebarItem>
 *           </JmSidebarGroup>
 *         </JmSidebarBody>
 *         <JmSidebarFooter>...</JmSidebarFooter>
 *       </JmSidebar>
 *       <main className="flex-1 min-w-0">
 *         <JmSidebarTrigger className="sm:hidden" />
 *         ...
 *       </main>
 *     </div>
 *   </JmSidebarProvider>
 *
 * Active 상태는 user 가 직접 active prop 으로 넘긴다. primitive 라 라우팅 모름.
 */

// ─── Mode context ─────────────────────────────────────────────────────────

export type JmSidebarMode = "expanded" | "collapsed" | "expand-on-hover";

interface JmSidebarContextValue {
  mode: JmSidebarMode;
  setMode: (m: JmSidebarMode) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const JmSidebarContext = React.createContext<JmSidebarContextValue | null>(
  null,
);

export function useJmSidebar(): JmSidebarContextValue {
  const ctx = React.useContext(JmSidebarContext);
  if (!ctx) {
    throw new Error("useJmSidebar must be used within <JmSidebarProvider>");
  }
  return ctx;
}

export interface JmSidebarProviderProps {
  children: React.ReactNode;
  defaultMode?: JmSidebarMode;
  mode?: JmSidebarMode;
  onModeChange?: (m: JmSidebarMode) => void;
}

export function JmSidebarProvider({
  children,
  defaultMode = "expanded",
  mode: controlledMode,
  onModeChange,
}: JmSidebarProviderProps) {
  const [internalMode, setInternalMode] =
    React.useState<JmSidebarMode>(defaultMode);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const mode = controlledMode ?? internalMode;
  const setMode = React.useCallback(
    (m: JmSidebarMode) => {
      if (controlledMode === undefined) setInternalMode(m);
      onModeChange?.(m);
    },
    [controlledMode, onModeChange],
  );

  // 모바일 overlay 열림 시 body scroll lock + ESC 닫기
  React.useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const value = React.useMemo(
    () => ({ mode, setMode, mobileOpen, setMobileOpen }),
    [mode, setMode, mobileOpen],
  );

  return (
    <JmSidebarContext.Provider value={value}>
      {children}
    </JmSidebarContext.Provider>
  );
}

// ─── Visual context (children read this for collapsed/expanded UI) ────────

interface JmSidebarVisualContextValue {
  /** UI 상 "라벨 숨김" 상태 — JmSidebarItem/Group 가 사용. */
  collapsed: boolean;
}

const JmSidebarVisualContext =
  React.createContext<JmSidebarVisualContextValue>({ collapsed: false });

function useJmSidebarVisual() {
  return React.useContext(JmSidebarVisualContext);
}

// ─── Sidebar Container ────────────────────────────────────────────────────

export interface JmSidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** "left" 또는 "right". 기본 left. */
  side?: "left" | "right";
  /** expanded 모드 + expand-on-hover hover 시 폭. 기본 "260px". */
  width?: string;
  /** collapsed 모드 + expand-on-hover idle 시 폭. 기본 "64px". */
  collapsedWidth?: string;
  /** 모바일 overlay 폭. 기본 "280px". */
  mobileWidth?: string;
  /** expand-on-hover 진입 지연 (ms). 기본 100. */
  hoverDelayMs?: number;
}

export const JmSidebar = React.forwardRef<HTMLElement, JmSidebarProps>(
  (
    {
      className,
      style,
      side = "left",
      width = "260px",
      collapsedWidth = "64px",
      mobileWidth = "280px",
      hoverDelayMs = 100,
      children,
      ...props
    },
    ref,
  ) => {
    const { mode, mobileOpen, setMobileOpen } = useJmSidebar();
    const [hoverExpanded, setHoverExpanded] = React.useState(false);
    const hoverTimerRef = React.useRef<number | null>(null);

    const isLeft = side === "left";
    const isExpandOnHover = mode === "expand-on-hover";

    // 모드 바뀌면 hover 상태 리셋
    React.useEffect(() => {
      setHoverExpanded(false);
    }, [mode]);

    React.useEffect(() => {
      return () => {
        if (hoverTimerRef.current !== null) {
          window.clearTimeout(hoverTimerRef.current);
        }
      };
    }, []);

    // outer (layout 점유) / inner (실제 표시) 폭 계산
    const outerWidth =
      mode === "expanded" ? width : collapsedWidth; // collapsed / hover 모드 모두 좁은 폭
    const innerWidthDesktop =
      mode === "expanded"
        ? width
        : mode === "collapsed"
          ? collapsedWidth
          : hoverExpanded
            ? width
            : collapsedWidth;

    // 라벨 숨김 여부 (children 이 참조)
    const isVisuallyCollapsed =
      mode === "collapsed" || (isExpandOnHover && !hoverExpanded);

    const handleMouseEnter = () => {
      if (!isExpandOnHover) return;
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      hoverTimerRef.current = window.setTimeout(() => {
        setHoverExpanded(true);
      }, hoverDelayMs);
    };
    const handleMouseLeave = () => {
      if (!isExpandOnHover) return;
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      setHoverExpanded(false);
    };

    const visualValue = React.useMemo(
      () => ({ collapsed: isVisuallyCollapsed }),
      [isVisuallyCollapsed],
    );

    return (
      <JmSidebarVisualContext.Provider value={visualValue}>
        {/* 모바일 backdrop */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="사이드바 닫기"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
          />
        )}
        {/* OUTER — layout 점유. 데스크톱에서만 자리 차지. */}
        <aside
          ref={ref}
          data-jm-sidebar
          data-side={side}
          data-mode={mode}
          data-hover-expanded={hoverExpanded ? "true" : "false"}
          data-mobile-open={mobileOpen ? "true" : "false"}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={
            {
              "--jm-sidebar-w-outer": outerWidth,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            // 모바일: display:contents (layout 점유 0, 그러나 children 은 부모 flex 의 자식처럼 동작 — 우리 inner 는 fixed 라 무관)
            // 데스크톱: in-flow block + outer 폭 reserve, inner 의 absolute 기준점
            "contents sm:block sm:relative sm:shrink-0 sm:w-[var(--jm-sidebar-w-outer)]",
            "sm:transition-[width] sm:duration-200 sm:ease-out",
            className,
          )}
          {...props}
        >
          {/* INNER — 실제 표시. 데스크톱에선 absolute (overflow 가능, expand-on-hover 핵심).
              모바일에선 fixed overlay. */}
          <div
            data-jm-scope
            style={
              {
                "--jm-sidebar-w-inner": innerWidthDesktop,
                "--jm-sidebar-w-mobile": mobileWidth,
              } as React.CSSProperties
            }
            className={cn(
              "flex flex-col bg-[var(--jm-surface)] text-[var(--jm-text)]",
              isLeft
                ? "border-r border-[var(--jm-border)]"
                : "border-l border-[var(--jm-border)]",
              // 데스크톱: absolute, inner 폭으로 변동
              "sm:absolute sm:inset-y-0 sm:z-30 sm:w-[var(--jm-sidebar-w-inner)]",
              isLeft ? "sm:left-0" : "sm:right-0",
              // expand-on-hover hover 시 그림자
              isExpandOnHover &&
                hoverExpanded &&
                "sm:shadow-[var(--jm-shadow-lg)]",
              // 모바일: fixed overlay
              "fixed inset-y-0 z-50 w-[var(--jm-sidebar-w-mobile)]",
              isLeft ? "left-0" : "right-0",
              "shadow-[var(--jm-shadow-lg)] sm:shadow-none",
              // 모바일 슬라이드
              mobileOpen
                ? "translate-x-0"
                : isLeft
                  ? "-translate-x-full sm:translate-x-0"
                  : "translate-x-full sm:translate-x-0",
              "transition-[transform,width] duration-200 ease-out",
              "overflow-hidden",
            )}
          >
            {children}
          </div>
        </aside>
      </JmSidebarVisualContext.Provider>
    );
  },
);
JmSidebar.displayName = "JmSidebar";

// ─── Header / Body / Footer ───────────────────────────────────────────────

/**
 * Sidebar 상단 — 컨텐츠 헤더와 같은 높이로 정렬.
 * 기본 h-12 px-4. 헤더 바깥 컨텐츠 헤더가 다른 높이면 h-* 클래스로 override.
 */
export const JmSidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-12 shrink-0 items-center gap-2 border-b border-[var(--jm-border)] px-4",
      className,
    )}
    {...props}
  />
));
JmSidebarHeader.displayName = "JmSidebarHeader";

/**
 * 스크롤 가능한 본문. JmScrollArea 로 감싸서 **overlay 스크롤바** (콘텐츠 위에 떠 있음, 폭 잠식 안 함).
 * collapsed (64px) 모드에서도 스크롤바가 영역 안 잡아먹는 게 핵심.
 */
export const JmSidebarBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("flex-1 min-h-0", className)} {...props}>
    <JmScrollArea
      className="h-full"
      viewportClassName="px-2 py-3"
      thumbSize={5}
    >
      {children}
    </JmScrollArea>
  </div>
));
JmSidebarBody.displayName = "JmSidebarBody";

export const JmSidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex shrink-0 items-center gap-2 border-t border-[var(--jm-border)] px-3 py-3",
      className,
    )}
    {...props}
  />
));
JmSidebarFooter.displayName = "JmSidebarFooter";

// ─── Group ────────────────────────────────────────────────────────────────

export interface JmSidebarGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

export const JmSidebarGroup = React.forwardRef<
  HTMLDivElement,
  JmSidebarGroupProps
>(({ className, label, children, ...props }, ref) => {
  const { collapsed } = useJmSidebarVisual();
  return (
    <div
      ref={ref}
      className={cn("mb-2 flex flex-col gap-0.5", className)}
      {...props}
    >
      {label && !collapsed && (
        <div className="px-2.5 pb-1 pt-2 text-jm-3xs font-semibold uppercase tracking-wider text-[var(--jm-text-subtle)]">
          {label}
        </div>
      )}
      {children}
    </div>
  );
});
JmSidebarGroup.displayName = "JmSidebarGroup";

export const JmSidebarSeparator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement>
>(({ className, ...props }, ref) => (
  <hr
    ref={ref}
    className={cn(
      "my-2 h-px shrink-0 border-0 bg-[var(--jm-border)]",
      className,
    )}
    {...props}
  />
));
JmSidebarSeparator.displayName = "JmSidebarSeparator";

// ─── Item ─────────────────────────────────────────────────────────────────

interface JmSidebarItemBaseProps {
  icon?: React.ReactNode;
  active?: boolean;
  /** 우측 보조 슬롯 — 카운트, 단축키 등 */
  trailing?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

type JmSidebarItemAsAnchor = JmSidebarItemBaseProps &
  Omit<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof JmSidebarItemBaseProps
  > & { href: string };

type JmSidebarItemAsButton = JmSidebarItemBaseProps &
  Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    keyof JmSidebarItemBaseProps
  > & { href?: undefined };

export type JmSidebarItemProps = JmSidebarItemAsAnchor | JmSidebarItemAsButton;

const itemClasses = (active: boolean | undefined, collapsed: boolean) =>
  cn(
    "group flex w-full items-center gap-2.5 rounded-lg px-2.5 outline-none transition-colors",
    "text-left text-jm-sm font-medium",
    "focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]",
    collapsed ? "h-10 justify-center px-0" : "h-9",
    active
      ? "bg-[var(--jm-surface-muted)] text-[var(--jm-text)]"
      : "text-[var(--jm-text-muted)] hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
    active &&
      !collapsed &&
      "relative before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-0.5 before:rounded-r before:bg-[var(--jm-action)]",
  );

export const JmSidebarItem = React.forwardRef<
  HTMLAnchorElement | HTMLButtonElement,
  JmSidebarItemProps
>((props, ref) => {
  const { collapsed } = useJmSidebarVisual();
  const { icon, active, trailing, className, children, ...rest } = props;

  const content = (
    <>
      {icon && (
        <span
          aria-hidden
          className="inline-flex size-5 shrink-0 items-center justify-center [&_svg]:size-4"
        >
          {icon}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {trailing && (
            <span className="ml-auto inline-flex shrink-0 items-center text-jm-xs text-[var(--jm-text-subtle)]">
              {trailing}
            </span>
          )}
        </>
      )}
    </>
  );

  const titleAttr =
    collapsed && typeof children === "string" ? children : undefined;

  if ("href" in rest && rest.href !== undefined) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        title={titleAttr}
        aria-current={active ? "page" : undefined}
        className={cn(itemClasses(active, collapsed), className)}
        {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      title={titleAttr}
      aria-current={active ? "page" : undefined}
      className={cn(itemClasses(active, collapsed), className)}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
});
JmSidebarItem.displayName = "JmSidebarItem";

// ─── Trigger (모바일 햄버거) ──────────────────────────────────────────────

export interface JmSidebarTriggerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  openIcon?: React.ReactNode;
  closeIcon?: React.ReactNode;
}

export const JmSidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  JmSidebarTriggerProps
>(({ className, openIcon, closeIcon, onClick, ...props }, ref) => {
  const { mobileOpen, setMobileOpen } = useJmSidebar();
  return (
    <button
      ref={ref}
      type="button"
      aria-label={mobileOpen ? "사이드바 닫기" : "사이드바 열기"}
      aria-expanded={mobileOpen}
      onClick={(e) => {
        setMobileOpen(!mobileOpen);
        onClick?.(e);
      }}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg text-[var(--jm-text-muted)] outline-none transition-colors",
        "hover:bg-[var(--jm-surface-muted)] hover:text-[var(--jm-text)]",
        "focus-visible:ring-4 focus-visible:ring-[var(--jm-ring)]",
        className,
      )}
      {...props}
    >
      {mobileOpen
        ? (closeIcon ?? <X className="size-5" />)
        : (openIcon ?? <Menu className="size-5" />)}
    </button>
  );
});
JmSidebarTrigger.displayName = "JmSidebarTrigger";
