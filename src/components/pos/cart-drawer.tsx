"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useSessions } from "@/components/pos/sessions-context";
import { usePosShell } from "@/components/pos/pos-shell-context";
import { CartCheckoutPanel } from "@/components/pos/cart-checkout-panel";

export function CartDrawer() {
  const { cartOpen, setCartOpen, pickedSessionId } = usePosShell();
  const { getSession } = useSessions();
  const session = pickedSessionId ? getSession(pickedSessionId) : undefined;
  const [netOnly, setNetOnly] = useState(false);

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-background p-0 shadow-none data-[side=right]:sm:w-1/2 data-[side=right]:sm:max-w-[50vw]"
      >
        <SheetHeader className="border-b border-border">
          <div className="flex items-center justify-between gap-3 pr-10">
            <SheetTitle>장바구니</SheetTitle>
            <Switch
              checked={netOnly}
              onCheckedChange={setNetOnly}
              aria-label="공급가액 표시"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {session ? (
            <CartCheckoutPanel session={session} netOnly={netOnly} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              세션이 없습니다
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
