"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Grid3x3 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSessions } from "@/components/pos/sessions-context";
import { calcCartTotals } from "@/components/pos/cart-helpers";
import { CustomerLinkSheet } from "@/components/pos/customer-link-sheet";

function getActiveSessionId(pathname: string): string {
  const m = pathname.match(/^\/pos\/cart\/([^/]+)/);
  return m?.[1] ?? "";
}

export function PosCustomerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { sessions, addSession, hydrated } = useSessions();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeSessionId = getActiveSessionId(pathname);
  const isAll = pathname === "/pos/all";

  const handleAdd = () => {
    const id = addSession();
    if (id) router.push(`/pos/cart/${id}`);
  };

  const handleCustomerClick = (sessionId: string) => {
    if (sessionId === activeSessionId) {
      setSheetOpen(true);
    } else {
      router.push(`/pos/cart/${sessionId}`);
    }
  };

  if (!hydrated) {
    return <div className="h-[92px] shrink-0 border-b border-border bg-background" />;
  }

  return (
    <>
      <div className="shrink-0 border-b border-border bg-background">
        <ScrollArea className="w-full">
          <div className="flex items-stretch gap-2 px-3 py-3 sm:px-4">
            {/* 전체보기 — 항상 첫번째 */}
            <button
              onClick={() => router.push("/pos/all")}
              className={cn(
                "flex min-w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 transition-all",
                isAll
                  ? "border-primary bg-primary/5 text-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
              )}
            >
              <Grid3x3 className="size-7" />
              <div className="text-sm font-medium leading-tight">전체보기</div>
            </button>

            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const displayName = s.customerName ?? s.label;
              const initial = displayName.charAt(0);
              const totals = calcCartTotals(s);
              return (
                <button
                  key={s.id}
                  onClick={() => handleCustomerClick(s.id)}
                  className={cn(
                    "flex min-w-[96px] shrink-0 flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 transition-all",
                    isActive
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-foreground/20"
                  )}
                >
                  <Avatar size="lg" className="size-12">
                    <AvatarFallback className="text-base font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-sm font-medium leading-tight">{displayName}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    ₩{totals.total.toLocaleString("ko-KR")}
                  </div>
                </button>
              );
            })}

            {/* 손님 추가 — 항상 마지막 */}
            <button
              onClick={handleAdd}
              className="flex min-w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
            >
              <Plus className="size-7" />
              <div className="text-sm font-medium leading-tight">손님 추가</div>
            </button>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {activeSessionId && (
        <CustomerLinkSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          sessionId={activeSessionId}
        />
      )}
    </>
  );
}
