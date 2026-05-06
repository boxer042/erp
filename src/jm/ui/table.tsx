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
    className={cn("[&_tr:last-child]:border-0", className)}
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
      "border-b border-[var(--jm-border)] transition-colors hover:bg-[var(--jm-surface-muted)] data-[state=selected]:bg-[var(--jm-surface-muted)]",
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
      "h-10 px-3 text-left align-middle text-jm-xs font-medium text-[var(--jm-text-muted)] [&:has([role=checkbox])]:pr-0",
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
      "px-3 py-2.5 align-middle text-[var(--jm-text)] [&:has([role=checkbox])]:pr-0",
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
