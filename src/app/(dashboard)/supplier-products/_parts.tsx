"use client";

import { JmSkeleton, JmTableCell, JmTableRow } from "@/jm";

export function SupplierProductsRowSkeleton() {
  return (
    <JmTableRow className="hover:bg-transparent">
      <JmTableCell><JmSkeleton className="h-4 w-24" /></JmTableCell>
      <JmTableCell><JmSkeleton className="h-4 w-40" /></JmTableCell>
      <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
      <JmTableCell><JmSkeleton className="h-4 w-20" /></JmTableCell>
      <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
      <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
      <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-16" /></div></JmTableCell>
      <JmTableCell><JmSkeleton className="h-5 w-20 rounded-md" /></JmTableCell>
      <JmTableCell><div className="flex justify-end"><JmSkeleton className="h-4 w-8" /></div></JmTableCell>
    </JmTableRow>
  );
}
