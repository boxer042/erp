"use client";

import { JmBadge } from "@/jm";
import { USED_ITEM_STATUS_LABEL, type UsedItemStatus } from "./_types";

const VARIANT_BY_STATUS: Record<
  UsedItemStatus,
  "success" | "default" | "warning" | "danger"
> = {
  IN_STOCK: "success",
  ASSEMBLED_INTO: "default",
  SOLD: "default",
  SCRAPPED: "danger",
};

export function UsedItemStatusBadge({ status }: { status: UsedItemStatus }) {
  return (
    <JmBadge variant={VARIANT_BY_STATUS[status]} size="sm" shape="square">
      {USED_ITEM_STATUS_LABEL[status]}
    </JmBadge>
  );
}
