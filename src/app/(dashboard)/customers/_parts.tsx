"use client";

import { Building2, User } from "lucide-react";
import { JmBadge, JmSkeleton, JmTableCell, JmTableRow } from "@/jm";
import type { CustomerType } from "./_types";

export function CustomerTypeBadge({ type }: { type: CustomerType }) {
  if (type === "BUSINESS") {
    return (
      <JmBadge variant="info" size="sm" shape="square">
        <Building2 className="size-3" />
        기업
      </JmBadge>
    );
  }
  return (
    <JmBadge variant="default" size="sm" shape="square">
      <User className="size-3" />
      개인
    </JmBadge>
  );
}

export function CustomerStatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <JmBadge variant="success" size="sm" shape="pill">
        활성
      </JmBadge>
    );
  }
  return (
    <JmBadge variant="default" size="sm" shape="pill">
      비활성
    </JmBadge>
  );
}

export function CustomerRowSkeleton() {
  return (
    <JmTableRow className="hover:bg-transparent">
      <JmTableCell>
        <JmSkeleton className="h-5 w-12 rounded-md" />
      </JmTableCell>
      <JmTableCell>
        <div className="flex flex-col gap-1.5">
          <JmSkeleton className="h-4 w-36" />
          <JmSkeleton className="h-3 w-24" />
        </div>
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-28" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-28" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-20" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-4 w-40" />
      </JmTableCell>
      <JmTableCell>
        <JmSkeleton className="h-5 w-12 rounded-full" />
      </JmTableCell>
      <JmTableCell>
        <div className="flex justify-end gap-1">
          <JmSkeleton className="h-8 w-8 rounded-md" />
          <JmSkeleton className="h-8 w-8 rounded-md" />
          <JmSkeleton className="h-8 w-8 rounded-md" />
        </div>
      </JmTableCell>
    </JmTableRow>
  );
}
