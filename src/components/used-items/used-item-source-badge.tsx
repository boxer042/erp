"use client";

import { JmBadge } from "@/jm";
import { USED_ITEM_SOURCE_LABEL, type UsedItemSource } from "./_types";

const VARIANT_BY_SOURCE: Record<
  UsedItemSource,
  "default" | "info" | "warning" | "success"
> = {
  PURCHASED: "default",
  SCAVENGED: "info",
  RENTAL_RETIREMENT: "info",
  EMERGENCY_USE: "warning",
  BUILT: "success",
};

export function UsedItemSourceBadge({ source }: { source: UsedItemSource }) {
  return (
    <JmBadge variant={VARIANT_BY_SOURCE[source]} size="sm" shape="square">
      {USED_ITEM_SOURCE_LABEL[source]}
    </JmBadge>
  );
}
