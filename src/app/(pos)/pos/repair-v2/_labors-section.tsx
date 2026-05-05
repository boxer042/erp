"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiMutate } from "@/lib/api-client";
import { fmtKRW } from "./_helpers";
import type { RepairLabor } from "./_types";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

/**
 * 공임 섹션 — 인라인 추가/삭제. 모바일 친화: 숫자키패드, 큰 입력.
 */
export function LaborsSection({
  ticketId,
  labors,
  readonly,
  onChanged,
}: {
  ticketId: string;
  labors: RepairLabor[];
  readonly: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  const add = useMutation({
    mutationFn: () =>
      apiMutate(`/api/repair-tickets/${ticketId}/labors`, "POST", {
        name: name.trim(),
        hours: 1,
        unitRate: parseInt(rate.replace(/,/g, ""), 10) || 0,
      }),
    onSuccess: () => {
      toast.success("공임 추가");
      setName("");
      setRate("");
      setAdding(false);
      onChanged();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가 실패"),
  });

  const del = useMutation({
    mutationFn: (laborId: string) =>
      apiMutate(`/api/repair-tickets/${ticketId}/labors/${laborId}`, "DELETE"),
    onSuccess: () => {
      toast.success("삭제됨");
      onChanged();
    },
  });

  const total = labors.reduce((s, l) => s + Number(l.totalPrice), 0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-zinc-900">공임</span>
          <span className="text-[12px] text-zinc-400">
            {labors.length === 0 ? "—" : `${labors.length}건`}
          </span>
        </div>
        {!readonly && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-9 items-center gap-1 rounded-full bg-zinc-100 px-4 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 3v8M3 7h8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            공임
          </button>
        )}
      </div>

      {adding && !readonly && (
        <div className="border-b border-zinc-100 bg-zinc-50 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="공임명 (예: 분해/조립)"
              className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-[14px] outline-none focus:border-zinc-400"
            />
            <input
              type="text"
              inputMode="numeric"
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d,]/g, ""))}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="₩ 금액"
              className="h-11 rounded-xl border border-zinc-200 bg-white px-4 text-right text-[15px] tabular-nums outline-none focus:border-zinc-400 sm:w-36"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName("");
                setRate("");
              }}
              className="rounded-xl px-4 py-2 text-[13px] text-zinc-500 hover:bg-zinc-100"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!name.trim() || !rate || add.isPending}
              onClick={() => add.mutate()}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {add.isPending ? "추가 중…" : "추가"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {labors.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-zinc-400 sm:px-5">
            추가된 공임이 없습니다
          </div>
        ) : (
          labors.map((l) => (
            <LaborRow
              key={l.id}
              ticketId={ticketId}
              labor={l}
              readonly={readonly}
              onChanged={onChanged}
              onDelete={() => del.mutate(l.id)}
              isDeleting={del.isPending}
            />
          ))
        )}
      </div>

      {labors.length > 0 && (
        <div className="flex justify-end border-t border-zinc-100 px-4 py-3 text-[13px] sm:px-5">
          <span className="font-semibold tabular-nums text-zinc-900">
            합계 {fmtKRW(total)}
          </span>
        </div>
      )}
    </div>
  );
}

function LaborRow({
  ticketId,
  labor,
  readonly,
  onChanged,
  onDelete,
  isDeleting,
}: {
  ticketId: string;
  labor: RepairLabor;
  readonly: boolean;
  onChanged: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [priceOpen, setPriceOpen] = useState(false);
  const update = useMutation({
    mutationFn: (data: { unitRate: number }) =>
      apiMutate(
        `/api/repair-tickets/${ticketId}/labors/${labor.id}`,
        "PATCH",
        data,
      ),
    onSuccess: () => onChanged(),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "수정 실패"),
  });

  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-50 px-4 py-3 last:border-b-0 sm:px-5">
      <span className="line-clamp-1 flex-1 text-[14px] font-medium text-zinc-900">
        {labor.name}
      </span>
      <button
        type="button"
        onClick={() => !readonly && setPriceOpen(true)}
        disabled={readonly}
        className="rounded-md px-2 py-1 text-right hover:bg-zinc-50 disabled:hover:bg-transparent"
      >
        <span className="text-[14px] font-semibold tabular-nums text-zinc-900">
          {fmtKRW(labor.totalPrice)}
        </span>
      </button>
      {!readonly && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-zinc-300 hover:text-rose-600"
          aria-label="삭제"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 6h10M8 6V4h4v2M7 6v10h6V6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <PriceInputDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        title={labor.name}
        initialNet={Number(labor.unitRate) || 0}
        taxType="TAXABLE"
        onSubmit={(net) => update.mutate({ unitRate: net })}
      />
    </div>
  );
}
