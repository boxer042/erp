"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useSessions } from "@/components/pos/sessions-context";

export function CartIndicator() {
  const { totalItemCount: itemCount } = useSessions();
  return (
    <Link
      href="/pos/sales"
      className="relative flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted/50"
    >
      <ShoppingCart className="h-4 w-4" />
      장바구니
      {itemCount > 0 ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}
