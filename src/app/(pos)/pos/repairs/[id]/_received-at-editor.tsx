"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { ApiError, apiMutate } from "@/lib/api-client";
import { DateTimePickerSheet } from "@/app/(pos)/pos/_components/datetime-picker-sheet";

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
 *   - 편집: 공용 DateTimePickerSheet 안에서 JmCalendar(인라인) + JmTimePicker(시/분 컬럼).
 */
export function ReceivedAtEditor({ ticketId, receivedAt, readonly, onSaved }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const display = format(new Date(receivedAt), "yyyy-MM-dd HH:mm");

  const save = useMutation({
    mutationFn: (next: Date) =>
      apiMutate(`/api/repair-tickets/${ticketId}`, "PUT", {
        receivedAt: next.toISOString(),
      }),
    onSuccess: () => {
      toast.success("접수 일시 저장됨");
      qc.invalidateQueries({ queryKey: ["repairs", "detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["repairs"] });
      qc.invalidateQueries({ queryKey: ["pos-v2", "repairs"] });
      onSaved?.();
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "저장 실패"),
  });

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
        <DateTimePickerSheet
          value={new Date(receivedAt)}
          onConfirm={(next) => save.mutate(next)}
          onClose={() => !save.isPending && setOpen(false)}
          title="접수 일시 변경"
          pending={save.isPending}
        />
      )}
    </>
  );
}
