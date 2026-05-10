"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, Loader2, Menu, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiMutate, ApiError } from "@/lib/api-client";
import { useSessions } from "@/components/pos/sessions-context";
import { MenuSheet } from "../_components/menu-sheet";
import { GlobalSearchSheet } from "../_global-search-sheet";

interface ParkedSession {
  id: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerType: "INDIVIDUAL" | "BUSINESS" | null;
  label: string;
  itemCount: number;
  parkedAt: string | null;
  updatedAt: string;
}

interface ResurrectResponse {
  sessionId: string;
}

/**
 * 저장된 상담 — parkedAt != null 인 PosSession 목록.
 * - 그리드에 노출 안 되지만 보존된 상담 카트들
 * - "장바구니로 가져오기" 누르면 unpark + 가격 갱신 + 손님 카드 부활 + 페이지 이동
 */
export default function ParkedSessionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { forceSync } = useSessions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"resurrect" | "delete" | null>(
    null,
  );

  const parkedQuery = useQuery<ParkedSession[]>({
    queryKey: ["pos-v2", "parked-sessions"],
    queryFn: () => apiGet<ParkedSession[]>("/api/pos/sessions/parked"),
    staleTime: 1000 * 30,
  });

  const resurrectMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate<ResurrectResponse>(`/api/pos/sessions/${id}/unpark`, "POST"),
    onMutate: (id) => {
      setPendingId(id);
      setPendingKind("resurrect");
    },
    onSuccess: async (data) => {
      toast.success("장바구니로 가져왔습니다");
      queryClient.invalidateQueries({ queryKey: ["pos-v2", "parked-sessions"] });
      await forceSync();
      router.push(`/pos/customer/${data.sessionId}`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "부활에 실패했습니다"),
    onSettled: () => {
      setPendingId(null);
      setPendingKind(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiMutate<{ ok: true }>(`/api/pos/sessions/parked?id=${id}`, "DELETE"),
    onMutate: (id) => {
      setPendingId(id);
      setPendingKind("delete");
    },
    onSuccess: () => {
      toast.success("저장된 상담을 삭제했습니다");
      queryClient.invalidateQueries({ queryKey: ["pos-v2", "parked-sessions"] });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
    onSettled: () => {
      setPendingId(null);
      setPendingKind(null);
    },
  });

  const items = parkedQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--jm-bg)]">
      <header className="shrink-0 border-b border-[var(--jm-border)] bg-[var(--jm-surface)]">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/pos")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="뒤로"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-[var(--jm-text)]">
              저장된 상담
            </span>
            <span className="text-[11px] text-[var(--jm-text-muted)]">
              장바구니로 저장한 손님 카트 — 가격은 부활 시 현재가로 갱신됩니다
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--jm-text)] hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)]"
            aria-label="메뉴"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4 sm:px-6">
          {parkedQuery.isPending ? (
            <RowsSkeleton />
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onResurrect={() => resurrectMutation.mutate(s.id)}
                  onDelete={() => {
                    const ok = window.confirm(
                      "이 저장된 상담을 영구 삭제할까요? 되돌릴 수 없습니다.",
                    );
                    if (!ok) return;
                    deleteMutation.mutate(s.id);
                  }}
                  pendingResurrect={
                    pendingId === s.id && pendingKind === "resurrect"
                  }
                  pendingDelete={pendingId === s.id && pendingKind === "delete"}
                />
              ))}
            </div>
          )}
          <div className="h-12" />
        </div>
      </main>

      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSearch={() => setSearchOpen(true)}
        onRepairManagement={() => router.push("/pos/repairs")}
        onRentalManagement={() => router.push("/pos/rentals")}
      />
      <GlobalSearchSheet open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function SessionRow({
  session,
  onResurrect,
  onDelete,
  pendingResurrect,
  pendingDelete,
}: {
  session: ParkedSession;
  onResurrect: () => void;
  onDelete: () => void;
  pendingResurrect: boolean;
  pendingDelete: boolean;
}) {
  const customerName =
    session.customerName ?? `미등록 손님 #${session.id.slice(0, 6)}`;
  const parked = session.parkedAt ? new Date(session.parkedAt) : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)]">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--jm-surface-muted)] text-[14px] font-bold text-[var(--jm-text)]">
        {customerName.charAt(0)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="line-clamp-1 text-[14px] font-semibold text-[var(--jm-text)]">
            {customerName}
          </span>
          {session.customerType === "BUSINESS" && (
            <span className="rounded bg-[var(--jm-surface-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--jm-text-muted)]">
              기업
            </span>
          )}
        </div>
        <span className="line-clamp-1 text-[12px] text-[var(--jm-text-muted)]">
          {session.itemCount > 0
            ? `${session.itemCount}건 담김`
            : "빈 카트"}
          {session.customerPhone && (
            <span className="ml-1.5 font-mono text-[var(--jm-text-subtle)]">
              {session.customerPhone}
            </span>
          )}
        </span>
        {parked && (
          <span className="text-[11px] text-[var(--jm-text-muted)]">
            {format(parked, "M/d HH:mm")} 저장 ·{" "}
            {formatDistanceToNow(parked, { addSuffix: true, locale: ko })}
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={onDelete}
          disabled={pendingResurrect || pendingDelete}
          className="flex size-9 items-center justify-center rounded-full text-[var(--jm-text-subtle)] ring-1 ring-[var(--jm-border)] transition-colors active:bg-[var(--jm-surface-muted)] disabled:opacity-50"
          aria-label="삭제"
        >
          {pendingDelete ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onResurrect}
          disabled={pendingResurrect || pendingDelete}
          className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--jm-action)] px-3 text-[12px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
        >
          {pendingResurrect ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShoppingBag className="size-4" />
          )}
          가져오기
        </button>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--jm-surface-muted)]">
        <ShoppingBag className="size-7 text-[var(--jm-text-subtle)]" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold text-[var(--jm-text)]">
          저장된 상담이 없습니다
        </span>
        <span className="text-[13px] text-[var(--jm-text-muted)]">
          카트의 [장바구니저장] 버튼으로 보관할 수 있어요
        </span>
      </div>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl bg-[var(--jm-surface)] p-3 ring-1 ring-[var(--jm-border)]"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--jm-surface-muted)]" />
          </div>
          <div className="h-9 w-20 animate-pulse rounded-full bg-[var(--jm-surface-muted)]" />
        </div>
      ))}
    </div>
  );
}
