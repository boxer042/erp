"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronDown,
  Clock,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmDropdownMenu,
  JmDropdownMenuContent,
  JmDropdownMenuItem,
  JmDropdownMenuSeparator,
  JmDropdownMenuTrigger,
} from "@/jm";
import { STATUS_META, type RepairTicketDetail } from "../_types";
import { CancelSheet } from "./_cancel-sheet";

/**
 * 수리 티켓 액션 메뉴 — 좌측 상태/타입 칩 자체가 dropdown trigger.
 *
 * RepairDetail standalone 페이지 헤더 + customer 페이지 부모 헤더 양쪽에서 같은 메뉴 사용.
 * 자체적으로 ticketQuery (cache 공유), typeMutation, cancelMutation, cancelOpen state 보유.
 *
 * - 즉시 ↔ 맡김 변경
 * - 수리 취소 (CancelSheet)
 *
 * readonly 티켓(PICKED_UP / CANCELLED) 은 칩만 표시하고 dropdown 비활성 — 정보 위계 유지.
 */
export function RepairTicketActionMenu({
  ticketId,
  onChanged,
}: {
  ticketId: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);

  // ticket fetch — RepairDetail 또는 RepairTicketHeader 와 cache 공유 (추가 요청 없음)
  const ticketQuery = useQuery({
    queryKey: ["repairs", "detail", ticketId],
    queryFn: () => apiGet<RepairTicketDetail>(`/api/repair-tickets/${ticketId}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["repairs", "detail", ticketId] });
    qc.invalidateQueries({ queryKey: ["repairs", "list"] });
    qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
    qc.invalidateQueries({ queryKey: ["repairs"] });
    onChanged?.();
  };

  const typeMutation = useMutation<unknown, Error, "ON_SITE" | "DROP_OFF">({
    mutationFn: (nextType) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", { type: nextType }),
    onSuccess: (_, nextType) => {
      toast.success(
        nextType === "ON_SITE" ? "즉시 수리로 변경됨" : "맡김 수리로 변경됨",
      );
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "변경 실패"),
  });

  const cancelMutation = useMutation<
    { success: boolean; hardDeleted?: boolean },
    Error,
    { cancelReason: string; cancelMemo: string }
  >({
    mutationFn: (payload) =>
      apiMutate(`/api/repair-tickets/${ticketId}/transition`, "POST", {
        action: "cancel",
        ...payload,
      }),
    onSuccess: (data) => {
      toast.success(data.hardDeleted ? "티켓이 영구 삭제됨" : "취소 처리됨");
      setCancelOpen(false);
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "취소 실패"),
  });

  const t = ticketQuery.data;
  if (!t) {
    // 로딩 — 칩 자리 차지용 placeholder (layout shift 방지)
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--jm-border)]" />
        <div className="h-3 w-14 animate-pulse rounded bg-[var(--jm-border)]" />
      </div>
    );
  }
  const meta = STATUS_META[t.status];
  const readonly = t.status === "PICKED_UP" || t.status === "CANCELLED";

  // readonly — 칩만 표시 (dropdown 없음)
  if (readonly) {
    return (
      <div className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${meta.dot}`} />
        <span className="text-jm-2xs font-semibold text-[var(--jm-text)]">
          {meta.label}
        </span>
        {t.type === "ON_SITE" && (
          <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            즉시
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <JmDropdownMenu>
        <JmDropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="수리 액션 메뉴"
              className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jm-action)]"
            >
              <span className={`size-2 rounded-full ${meta.dot}`} />
              <span className="text-jm-2xs font-semibold text-[var(--jm-text)]">
                {meta.label}
              </span>
              {t.type === "ON_SITE" && (
                <span className="rounded bg-[var(--jm-action)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  즉시
                </span>
              )}
              <ChevronDown className="size-3 text-[var(--jm-text-muted)]" />
            </button>
          }
        />
        <JmDropdownMenuContent align="start" sideOffset={6}>
          {t.type === "ON_SITE" ? (
            <JmDropdownMenuItem
              onClick={() => typeMutation.mutate("DROP_OFF")}
              disabled={typeMutation.isPending}
            >
              <Clock className="size-4" />
              맡김 수리로 변경
            </JmDropdownMenuItem>
          ) : (
            <JmDropdownMenuItem
              onClick={() => typeMutation.mutate("ON_SITE")}
              disabled={typeMutation.isPending}
            >
              <ArrowRightLeft className="size-4" />
              즉시 수리로 변경
            </JmDropdownMenuItem>
          )}
          <JmDropdownMenuSeparator />
          <JmDropdownMenuItem danger onClick={() => setCancelOpen(true)}>
            <X className="size-4" />
            수리 취소
          </JmDropdownMenuItem>
        </JmDropdownMenuContent>
      </JmDropdownMenu>

      <CancelSheet
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        isUnregistered={!t.customer}
        hasArchivalValue={
          !!t.customer ||
          !!t.serialItem ||
          t.parts.some((p) => p.status === "LOST") ||
          Number(t.diagnosisFee) > 0
        }
        parts={t.parts.map((p) => ({
          id: p.id,
          name: p.product.name,
          status: p.status,
        }))}
        onConfirm={(reason, memo) =>
          cancelMutation.mutate({ cancelReason: reason, cancelMemo: memo })
        }
        loading={cancelMutation.isPending}
      />
    </>
  );
}
