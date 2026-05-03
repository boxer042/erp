"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const { sessions, addSession, hydrated } = useSessions();
  const [sheetOpen, setSheetOpen] = useState(false);

  const activeSessionId = getActiveSessionId(pathname);
  const isAll = pathname === "/pos/all";

  // 고객 변경 시 현재 mode를 유지 (수리 → 다른 고객 클릭해도 수리 모드 유지)
  const currentMode = searchParams.get("mode");

  const buildHref = (sid: string) => {
    if (!currentMode || currentMode === "product") return `/pos/cart/${sid}`;
    return `/pos/cart/${sid}?mode=${currentMode}`;
  };

  const handleAdd = () => {
    const id = addSession();
    if (id) router.push(buildHref(id));
  };

  const handleCustomerClick = (sessionId: string) => {
    if (sessionId === activeSessionId) {
      setSheetOpen(true);
    } else {
      router.push(buildHref(sessionId));
    }
  };

  if (!hydrated) {
    return <div className="h-[92px] shrink-0 border-b border-border bg-background" />;
  }

  // 전체보기(고객 그리드) 화면에서는 상단 고객 탭 숨김
  if (isAll) return null;

  return (
    <>
      <div className="shrink-0 bg-background">
        <ScrollArea className="w-full">
          <div className="flex items-stretch gap-2 px-3 py-3 sm:px-4">
            {/* 전체보기 — 항상 첫번째 */}
            <button
              onClick={() => router.push("/pos/all")}
              className={cn(
                "flex aspect-square w-25 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-card px-2 ring-1 ring-foreground/10 transition-all",
                isAll
                  ? "text-foreground ring-2 ring-primary"
                  : "text-muted-foreground hover:text-foreground"
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
                    "flex aspect-square w-25 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-card px-2 ring-1 ring-foreground/10 transition-all",
                    isActive && "ring-2 ring-primary"
                  )}
                >
                  <Avatar size="lg" className="size-10">
                    <AvatarFallback className="text-sm font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="line-clamp-1 w-full text-center text-sm font-medium leading-tight">
                    {displayName}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    ₩{totals.total.toLocaleString("ko-KR")}
                  </div>
                </button>
              );
            })}

            {/* 고객 추가 — 항상 마지막 */}
            <button
              onClick={handleAdd}
              className="flex aspect-square w-25 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl bg-card px-2 text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground"
            >
              <Plus className="size-7" />
              <div className="text-sm font-medium leading-tight">고객 추가</div>
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
