import * as React from "react";
import { cn } from "@/jm/lib/cn";

export const JmTable = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-jm-base", className)}
      {...props}
    />
  </div>
));
JmTable.displayName = "JmTable";

export const JmTableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      // 헤더와 본문 사이 1줄만 — 행간 보더는 본문에서 divide-y 로 처리
      "bg-[var(--jm-surface-muted)] [&_tr]:border-b [&_tr]:border-[var(--jm-border)]",
      className,
    )}
    {...props}
  />
));
JmTableHeader.displayName = "JmTableHeader";

export const JmTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      // 행 사이는 subtle divide — 누적된 border 누설 방지 (jm-border 보다 한 단계 옅음)
      "[&_tr]:border-b [&_tr]:border-[color-mix(in_oklch,var(--jm-border)_50%,transparent)] [&_tr:last-child]:border-0",
      className,
    )}
    {...props}
  />
));
JmTableBody.displayName = "JmTableBody";

export const JmTableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-[var(--jm-border)] bg-[var(--jm-surface-muted)] font-semibold",
      className,
    )}
    {...props}
  />
));
JmTableFooter.displayName = "JmTableFooter";

export const JmTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // 행간 보더는 부모(JmTableBody/Header) 가 부여 — 여기서 직접 부여하면 누적 누설
      "transition-colors hover:bg-[var(--jm-surface-muted)] data-[state=selected]:bg-[var(--jm-surface-muted)]",
      className,
    )}
    {...props}
  />
));
JmTableRow.displayName = "JmTableRow";

export const JmTableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      // 가로 스크롤 테이블에서 컬럼이 좁은 화면에서 압축되지 않도록 nowrap 기본.
      // 줄바꿈이 필요한 셀은 className 으로 whitespace-normal override.
      "h-10 px-3 text-left align-middle whitespace-nowrap text-jm-xs font-medium text-[var(--jm-text-muted)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
JmTableHead.displayName = "JmTableHead";

export const JmTableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      // 가로 스크롤 테이블에서 컬럼이 좁은 화면에서 압축되지 않도록 nowrap 기본.
      // 줄바꿈이 필요한 셀은 className 으로 whitespace-normal override.
      "px-3 py-2.5 align-middle whitespace-nowrap text-[var(--jm-text)] [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
JmTableCell.displayName = "JmTableCell";

export const JmTableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn(
      "mt-3 text-jm-xs text-[var(--jm-text-muted)]",
      className,
    )}
    {...props}
  />
));
JmTableCaption.displayName = "JmTableCaption";
