"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { ApiError, apiMutate } from "@/lib/api-client";
import { JmButton, JmCalendar } from "@/jm";
import { BottomSheet } from "@/app/(pos)/pos/_components/bottom-sheet";

interface Props {
  ticketId: string;
  receivedAt: string;
  readonly?: boolean;
  onSaved?: () => void;
}

/**
 * 접수 일시 편집 — `/pos/customer/[sid]?mode=repair` 의 수리진행 페이지와
 * `/pos/repairs/[id]` 의 수리관리 상세 페이지가 RepairDetail → CustomerDeviceCard 를
 * 공유하므로, 여기 한 곳을 수정하면 두 라우트에 동시 반영된다.
 *
 * UI:
 *   - 읽기: yyyy-MM-dd HH:mm 텍스트. readonly 면 클릭 비활성.
 *   - 편집: BottomSheet 안에서 JmCalendar(인라인) + native <input type="time"> 입력.
 */
export function ReceivedAtEditor({ ticketId, receivedAt, readonly, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const display = format(new Date(receivedAt), "yyyy-MM-dd HH:mm");

  return (
    <>
      <button
        type="button"
        disabled={readonly}
        onClick={() => setOpen(true)}
        className="-mx-2 -my-1 flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-[var(--jm-surface-muted)] active:bg-[var(--jm-border)] disabled:cursor-default disabled:hover:bg-transparent disabled:active:bg-transparent"
      >
        <span className="text-[14px] text-[var(--jm-text)]">{display}</span>
        {!readonly && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="shrink-0 text-[var(--jm-text-subtle)]"
            aria-hidden
          >
            <path
              d="M9 2.5l2.5 2.5L5 11.5H2.5V9L9 2.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {open && (
        <EditorSheet
          ticketId={ticketId}
          receivedAt={receivedAt}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function EditorSheet({
  ticketId,
  receivedAt,
  onClose,
  onSaved,
}: {
  ticketId: string;
  receivedAt: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const initial = new Date(receivedAt);
  const [date, setDate] = useState<Date>(initial);
  const [time, setTime] = useState<string>(format(initial, "HH:mm"));

  const save = useMutation({
    mutationFn: () => {
      const [h, m] = time.split(":").map((v) => parseInt(v, 10));
      const next = new Date(date);
      next.setHours(
        Number.isFinite(h) ? h : 0,
        Number.isFinite(m) ? m : 0,
        0,
        0,
      );
      return apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        receivedAt: next.toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("접수 일시 저장됨");
      qc.invalidateQueries({ queryKey: ["repairs", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
      onSaved?.();
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

  return (
    <BottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="접수 일시 변경"
      footer={
        <div className="flex gap-2">
          <JmButton
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            className="flex-1"
            disabled={save.isPending}
          >
            취소
          </JmButton>
          <JmButton
            type="button"
            variant="cta"
            size="lg"
            onClick={() => save.mutate()}
            className="flex-1"
            disabled={save.isPending}
          >
            저장
          </JmButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-1 pt-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            날짜
          </span>
          <JmCalendar
            value={date}
            onChange={(d) => d && setDate(d)}
            toDate={new Date()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--jm-text-muted)]">
            시간
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] px-4 text-jm-base tabular-nums text-[var(--jm-text)] outline-none transition-colors hover:border-[var(--jm-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--jm-ring)]"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
