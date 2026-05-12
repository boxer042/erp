"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
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
 * 테이블 상단 툴바 — **항상 2-row** CSS Grid 레이아웃 (모바일·데스크톱 통일).
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │ [search                       ]  [actions]      │ row 1
 *   ├─────────────────────────────────────────────────┤
 *   │ [pill] [pill] [pill] [필터▾] ...                │ row 2 (가로 스크롤)
 *   └─────────────────────────────────────────────────┘
 *
 * 슬롯:
 *   <JmTableToolbarSearch>  검색 (row 1 좌측, 풀폭)
 *   <JmTableToolbarActions> primary CTA + secondary icon (row 1 우측)
 *   <JmTableToolbarFilters> pill / select 가로 스크롤 strip (row 2 풀폭)
 *   <JmTableToolbarMore>    [필터 N▾] 버튼 → 데스크톱 popover, 모바일 drawer
 *                            폭 큰 select·date picker 묶음
 *
 * row 2 (filters) 인터랙션:
 *   - 마우스 휠 deltaY → 가로 scrollLeft 변환
 *   - 좌클릭 드래그 → grab 스크롤 (5px 임계값으로 click-vs-drag 구분)
 *   - 트랙패드 가로 스와이프 / 터치 / 키보드 Tab 자동 스크롤 — 네이티브
 */
export const JmTableToolbar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid items-center gap-y-2 gap-x-3 border-b border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 py-3",
      // 항상 2행 — row1: search + actions, row2: filters 풀폭
      "[grid-template-areas:'search_actions'_'filters_filters']",
      "[grid-template-columns:minmax(0,1fr)_auto]",
      className,
    )}
    {...props}
  />
));
JmTableToolbar.displayName = "JmTableToolbar";

/** 검색 슬롯 — grid-area: search. row 1 좌측 풀폭. */
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

// ─── Drag scroll + wheel-to-horizontal hook ───────────────────────────────

const DRAG_THRESHOLD_PX = 5;

function useHorizontalScrollGestures(
  ref: React.RefObject<HTMLDivElement | null>,
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // ── 마우스 드래그 스크롤 ──
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let didDrag = false;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // 콘텐츠가 안 넘치면 드래그 무의미
      if (el.scrollWidth <= el.clientWidth) return;
      // form control(button/input/select 등) 안에서 시작한 mousedown 은 그대로 두되,
      // 드래그가 임계값 넘으면 click 차단
      isDown = true;
      didDrag = false;
      startX = e.pageX;
      startScrollLeft = el.scrollLeft;
      el.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (!didDrag && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
      didDrag = true;
      el.scrollLeft = startScrollLeft - dx;
      // 텍스트 선택 막기
      e.preventDefault();
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      el.style.cursor = "";
    };

    // 드래그 중이었으면 click 이벤트 차단 (자식 pill onClick 발화 방지)
    const onClickCapture = (e: MouseEvent) => {
      if (didDrag) {
        e.preventDefault();
        e.stopPropagation();
        didDrag = false;
      }
    };

    // ── 마우스 휠 deltaY → 가로 스크롤 변환 ──
    const onWheel = (e: WheelEvent) => {
      // Shift+wheel 은 브라우저가 기본 가로 스크롤 — 그대로 둠
      if (e.shiftKey) return;
      if (e.deltaY === 0) return;
      if (el.scrollWidth <= el.clientWidth) return;
      // 경계: 더 이상 가로 스크롤할 수 없으면 페이지 스크롤로 bubble
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd =
        Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth &&
        e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", onWheel);
    };
  }, [ref]);
}

/**
 * 필터/칩 슬롯 — grid-area: filters (row 2 풀폭).
 *
 * 가로 스크롤(wrap 안 함). 입력 방식 모두 지원:
 *   - 휠 (수직 → 수평 자동 변환)
 *   - 좌클릭 드래그 grab-scroll (5px 임계값으로 클릭과 구분)
 *   - 트랙패드 가로 스와이프
 *   - 터치 스와이프
 *   - 키보드 Tab (focus 자동 스크롤)
 */
export const JmTableToolbarFilters = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => {
  const localRef = React.useRef<HTMLDivElement | null>(null);
  // forwarded ref 와 local ref 연결
  React.useImperativeHandle(
    ref,
    () => localRef.current as HTMLDivElement,
    [],
  );
  useHorizontalScrollGestures(localRef);

  return (
    <div
      ref={localRef}
      style={{ gridArea: "filters", ...style }}
      className={cn(
        "flex min-w-0 items-center gap-2 overflow-x-auto",
        // 스크롤바 시각적으로 숨김 (interaction 은 위 hook 으로 보강)
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // 직속 자식은 shrink 안 함
        "[&>*]:shrink-0",
        // 드래그 가능 힌트
        "cursor-grab select-none",
        className,
      )}
      {...props}
    />
  );
});
JmTableToolbarFilters.displayName = "JmTableToolbarFilters";

// ─── More button — 데스크톱 popover, 모바일 drawer ─────────────────────────

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
  /** 활성화된 필터 개수 — 0 보다 크면 버튼에 배지 노출. */
  count?: number;
  /** 트리거 버튼 라벨 (= drawer 제목). 기본 "필터". */
  label?: string;
  /** 초기화 콜백. 있으면 popover/drawer 푸터에 "초기화" 버튼 노출. */
  onReset?: () => void;
  /** popover 폭 (데스크톱). 기본 "320px". */
  popoverWidth?: string;
}

/**
 * 추가 필터 슬롯 — 폭 큰 select·date picker·multi-select 등을 모아 popover/drawer 로.
 *
 *   <JmTableToolbarFilters>
 *     <JmPill>...</JmPill>
 *     <JmTableToolbarMore count={3} onReset={resetAll}>
 *       <JmFormField label="채널"><JmSelect ... /></JmFormField>
 *       <JmFormField label="기간"><JmDateRangePicker ... /></JmFormField>
 *     </JmTableToolbarMore>
 *   </JmTableToolbarFilters>
 *
 * 데스크톱: [필터 N▾] 버튼 → bottom-end popover
 * 모바일:   [필터 N▾] 버튼 → bottom drawer
 *
 * children 은 한 번만 마운트되어 popover/drawer 안에서만 나타남 (인라인 노출 안 함).
 */
export function JmTableToolbarMore({
  children,
  count,
  label = "필터",
  onReset,
  popoverWidth = "320px",
}: JmTableToolbarMoreProps) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = React.useState(false);
  const hasCount = typeof count === "number" && count > 0;

  const trigger = (
    <JmButton variant="outline" size="sm" className="gap-1.5">
      <SlidersHorizontal className="size-4" />
      {label}
      {hasCount && (
        <JmBadge size="sm" variant="solid">
          {count}
        </JmBadge>
      )}
    </JmButton>
  );

  if (isDesktop) {
    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger render={trigger} />
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            side="bottom"
            align="end"
            sideOffset={6}
            className="isolate z-50"
          >
            <PopoverPrimitive.Popup
              data-jm-scope
              style={{ width: popoverWidth }}
              className={cn(
                "z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-xl bg-[var(--jm-surface)] ring-1 ring-[var(--jm-border)] shadow-[var(--jm-shadow-lg)] outline-none font-[family-name:var(--jm-font-sans)]",
                "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
              )}
            >
              <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-4 py-2.5">
                <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                  {label}
                </span>
                {hasCount && (
                  <JmBadge size="sm" variant="default">
                    {count} 적용
                  </JmBadge>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {children}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--jm-border)] px-4 py-2.5">
                {onReset && (
                  <JmButton variant="ghost" size="sm" onClick={onReset}>
                    초기화
                  </JmButton>
                )}
                <JmButton size="sm" onClick={() => setOpen(false)}>
                  완료
                </JmButton>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    );
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>
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
