"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, Grid3x3, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSessions, type CartSession } from "@/components/pos/sessions-context";
import { CustomerLinkSheet } from "@/components/pos/customer-link-sheet";

function getActiveSessionId(pathname: string): string {
  const m = pathname.match(/^\/pos\/cart\/([^/]+)/);
  return m?.[1] ?? "";
}

export function PosCustomerHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sessions, addSession, removeSession, hydrated } = useSessions();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CartSession | null>(null);

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

  const confirmClose = () => {
    if (!closeTarget) return;
    const id = closeTarget.id;
    setCloseTarget(null);
    removeSession(id);
    // 활성 세션이 닫힌 경우 첫번째 세션 또는 전체보기로 이동
    if (id === activeSessionId) {
      const remaining = sessions.find((s) => s.id !== id);
      if (remaining) router.push(buildHref(remaining.id));
      else router.push("/pos/all");
    }
  };

  if (!hydrated) {
    return <div className="h-[92px] shrink-0 border-b border-border bg-background" />;
  }

  // 전체보기(고객 그리드) 화면에서는 상단 고객 탭 숨김
  if (isAll) return null;

  const targetOpenRepairs = closeTarget?.openRepairCount ?? 0;
  const targetCartCount = closeTarget?.items.reduce((a, i) => a + i.quantity, 0) ?? 0;
  const blocked = targetOpenRepairs > 0;

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
              // 진행 내역 — 카트 라인 종류 + 진행중 수리 티켓 유무
              const activities: string[] = [];
              const hasProduct = s.items.some((i) => i.itemType === "product");
              const hasRepairCart = s.items.some((i) => i.itemType === "repair");
              const hasRepairTicket = (s.openRepairCount ?? 0) > 0;
              const hasRental = s.items.some((i) => i.itemType === "rental");
              if (hasProduct) activities.push("상품");
              if (hasRepairCart || hasRepairTicket) activities.push("수리");
              if (hasRental) activities.push("임대");
              const activityText = activities.join(", ");
              return (
                <div key={s.id} className="relative shrink-0">
                  <button
                    onClick={() => handleCustomerClick(s.id)}
                    className={cn(
                      "flex aspect-square w-25 flex-col items-center justify-center gap-1 rounded-xl bg-card px-2 ring-1 ring-foreground/10 transition-all",
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
                    <div
                      className={cn(
                        "line-clamp-1 text-xs",
                        activityText ? "text-primary" : "text-muted-foreground/60",
                      )}
                    >
                      {activityText || "—"}
                    </div>
                  </button>
                  {isActive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCloseTarget(s);
                      }}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-110"
                      aria-label="고객 탭 닫기"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
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

      <Dialog open={!!closeTarget} onOpenChange={(o) => !o && setCloseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {blocked ? "고객 탭을 닫을 수 없습니다" : "고객 탭을 닫으시겠습니까?"}
            </DialogTitle>
            <DialogDescription>
              {blocked ? (
                <>
                  진행중 수리 <strong>{targetOpenRepairs}건</strong>이 있습니다.
                  먼저 수리를 완료하거나 취소한 뒤 닫을 수 있습니다.
                </>
              ) : targetCartCount > 0 ? (
                <>
                  장바구니 <strong>{targetCartCount}건</strong>이 함께 사라집니다.
                  계속하시겠습니까?
                </>
              ) : (
                <>이 고객 탭을 닫습니다.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTarget(null)}>
              {blocked ? "닫기" : "취소"}
            </Button>
            {!blocked && (
              <Button variant="destructive" onClick={confirmClose}>
                탭 닫기
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
