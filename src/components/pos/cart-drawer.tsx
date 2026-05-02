"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSessions } from "@/components/pos/sessions-context";
import { usePosShell } from "@/components/pos/pos-shell-context";
import { CartCheckoutPanel } from "@/components/pos/cart-checkout-panel";

export function CartDrawer() {
  const { cartOpen, setCartOpen, pickedSessionId } = usePosShell();
  const { getSession } = useSessions();
  const session = pickedSessionId ? getSession(pickedSessionId) : undefined;

  return (
    <Sheet open={cartOpen} onOpenChange={setCartOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:w-1/2 data-[side=right]:sm:max-w-[50vw]"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            장바구니
            {session?.customerName ? ` · ${session.customerName}` : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {session ? (
            <CartCheckoutPanel session={session} />
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
