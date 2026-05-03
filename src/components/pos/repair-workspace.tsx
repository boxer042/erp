"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardList,
  Loader2,
  MapPin,
  Plus,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useSessions } from "@/components/pos/sessions-context";
import { CustomerLinkSheet } from "@/components/pos/customer-link-sheet";
import { RepairWorkView } from "@/components/pos/repair-work-view";

interface OpenRepair {
  id: string;
  ticketNo: string;
  type: "ON_SITE" | "DROP_OFF";
  status: string;
  symptom: string | null;
  receivedAt: string;
}

interface Props {
  sessionId: string;
}

/**
 * 카트 워크스페이스 mode=repair 통합 — 모든 상태에서 동일한 레이아웃:
 *   상단: 수리 탭 바 (진행중 티켓 + [+ 새 수리])
 *   하단: 활성 탭의 작업 화면 또는 안내 메시지
 *
 * URL ?ticket={id} — 활성 탭 기억.
 */
export function RepairWorkspace({ sessionId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { getSession, addSessionRepairTicket } = useSessions();
  const session = getSession(sessionId);
  const customerId = session?.customerId;
  const sessionRepairIds = session?.repairTicketIds ?? [];

  const activeTicketId = searchParams.get("ticket");

  const [newOpen, setNewOpen] = useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);

  // 등록 고객: customerId로 fetch / 미등록: 세션이 추적한 ticketIds로 fetch
  const repairsQuery = useQuery({
    queryKey: customerId
      ? ["repairs", "open-by-customer", customerId]
      : ["repairs", "open-by-session", sessionId, sessionRepairIds.join(",")],
    queryFn: () => {
      if (customerId) {
        return apiGet<OpenRepair[]>(`/api/repair-tickets?customerId=${customerId}`);
      }
      if (sessionRepairIds.length === 0) return Promise.resolve([] as OpenRepair[]);
      return apiGet<OpenRepair[]>(
        `/api/repair-tickets?ids=${sessionRepairIds.join(",")}`,
      );
    },
    enabled: !!customerId || sessionRepairIds.length > 0,
  });

  const openRepairs = (repairsQuery.data ?? []).filter(
    (r) => r.status !== "PICKED_UP" && r.status !== "CANCELLED",
  );

  const setActiveTicket = useCallback(
    (ticketId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (ticketId) params.set("ticket", ticketId);
      else params.delete("ticket");
      router.replace(`/pos/cart/${sessionId}?${params}`);
    },
    [router, searchParams, sessionId],
  );

  // 활성 탭 자동 보정 — 데이터/고객 변경 시:
  // (a) activeTicketId가 현재 진행중 목록에 없거나(다른 고객 또는 PICKED_UP/CANCELLED),
  // (b) activeTicketId가 비어있는데 진행중 수리가 있으면,
  // → 가장 최신(receivedAt DESC) 진행중 수리로 자동 전환.
  useEffect(() => {
    if (!repairsQuery.data) return;
    const open = repairsQuery.data.filter(
      (r) => r.status !== "PICKED_UP" && r.status !== "CANCELLED",
    );
    const validActive =
      activeTicketId && open.some((r) => r.id === activeTicketId);
    if (!validActive) {
      setActiveTicket(open[0]?.id ?? null);
    }
  }, [repairsQuery.data, activeTicketId, setActiveTicket]);

  const closeTab = (ticketId: string) => {
    if (activeTicketId === ticketId) {
      const others = openRepairs.filter((r) => r.id !== ticketId);
      setActiveTicket(others[0]?.id ?? null);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (type: "ON_SITE" | "DROP_OFF") => {
      const ticket = await apiMutate<{ id: string; ticketNo: string }>(
        "/api/repair-tickets",
        "POST",
        {
          type,
          customerId: customerId ?? null,
          symptom: null,
        },
      );
      if (type === "ON_SITE") {
        await apiMutate(
          `/api/repair-tickets/${ticket.id}/transition`,
          "POST",
          { action: "start" },
        );
      }
      // 미등록 고객이라도 세션에 추적해서 다음 fetch에 포함되도록
      addSessionRepairTicket(ticket.id, sessionId);
      return { ticket, type };
    },
    onSuccess: ({ ticket, type }) => {
      toast.success(
        `${type === "ON_SITE" ? "즉시수리" : "맡김수리"} 시작 — ${ticket.ticketNo}`,
      );
      queryClient.invalidateQueries({ queryKey: ["repairs"] });
      setNewOpen(false);
      setActiveTicket(ticket.id);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message),
  });

  const handleNewRepair = () => setNewOpen(true);

  return (
    <div className="flex h-full flex-col">
      {/* 수리 탭 바 — 항상 동일 위치 */}
      <div className="flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-background px-2 py-2">
        {openRepairs.map((r) => (
          <RepairTab
            key={r.id}
            repair={r}
            active={activeTicketId === r.id}
            onSelect={() => setActiveTicket(r.id)}
            onClose={() => closeTab(r.id)}
          />
        ))}
        <button
          type="button"
          onClick={handleNewRepair}
          className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-3.5" />새 수리
        </button>
      </div>

      {/* 본문 영역 — 활성 탭 작업화면 또는 빈 상태 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTicketId ? (
          <RepairWorkView
            key={activeTicketId}
            ticketId={activeTicketId}
            hideBack
          />
        ) : (
          <EmptyState
            session={session}
            isLoadingRepairs={repairsQuery.isPending && !!customerId}
            onConnectCustomer={() => setCustomerSheetOpen(true)}
            onNewRepair={handleNewRepair}
          />
        )}
      </div>

      {/* 새 수리 다이얼로그 */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>새 수리 시작</DialogTitle>
            <DialogDescription>
              {session?.customerName ?? session?.label} 고객의 새 수리 — 유형을 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate("ON_SITE")}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <MapPin className="size-4" />
                즉시수리
              </span>
              <span className="text-xs text-muted-foreground">
                현장에서 바로 수리, 작업 후 그 자리에서 픽업/결제
              </span>
            </button>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate("DROP_OFF")}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Wrench className="size-4" />
                맡김수리
              </span>
              <span className="text-xs text-muted-foreground">
                며칠 보관 후 픽업, 진단/견적 단계 가능
              </span>
            </button>
          </div>
          {createMutation.isPending && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              생성 중...
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setNewOpen(false)}>
              취소
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 고객 연결 시트 — 미연결 시 또는 변경 */}
      <CustomerLinkSheet
        open={customerSheetOpen}
        onOpenChange={setCustomerSheetOpen}
        sessionId={sessionId}
      />
    </div>
  );
}

function EmptyState({
  session,
  isLoadingRepairs,
  onConnectCustomer,
  onNewRepair,
}: {
  session: ReturnType<ReturnType<typeof useSessions>["getSession"]>;
  isLoadingRepairs: boolean;
  onConnectCustomer: () => void;
  onNewRepair: () => void;
}) {
  if (isLoadingRepairs) {
    return (
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      {/* 고객 카드 — 등록/미등록 동일 톤 */}
      <button
        type="button"
        onClick={onConnectCustomer}
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
      >
        <Avatar className="size-10">
          <AvatarFallback className="text-sm font-semibold">
            {(session?.customerName ?? session?.label ?? "?").charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold">
            {session?.customerName ?? session?.label ?? "고객"}
          </div>
          {session?.customerId && session.customerPhone ? (
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {session.customerPhone}
            </div>
          ) : !session?.customerId ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <UserPlus className="size-3" />
              <span>기존 고객 검색 또는 신규 등록</span>
            </div>
          ) : null}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* 진행중 수리 없음 안내 + 새 수리 버튼 */}
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <ClipboardList className="size-10 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">진행중인 수리가 없습니다</div>
          <div className="text-xs text-muted-foreground">
            새 수리를 시작하세요 — 고객 등록은 결제 단계에서도 가능합니다
          </div>
        </div>
        <Button onClick={onNewRepair}>
          <Plus className="size-4" />
          새 수리 시작
        </Button>
      </div>
    </div>
  );
}

function RepairTab({
  repair,
  active,
  onSelect,
  onClose,
}: {
  repair: OpenRepair;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5"
      >
        {repair.type === "ON_SITE" ? (
          <MapPin className="size-3" />
        ) : (
          <ClipboardList className="size-3" />
        )}
        <span className="font-mono">{repair.ticketNo}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-background group-hover:opacity-100"
        aria-label="탭 닫기"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
