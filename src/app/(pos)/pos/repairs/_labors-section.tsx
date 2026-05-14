"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import {
  JmButton,
  JmCard,
  JmIconButton,
  JmInput,
  JmNumberInput,
} from "@/jm";
import { fmtKRWInc } from "./_helpers";
import type { RepairLabor } from "./_types";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface RecommendedLabor {
  name: string;
  unitRate: number;
  occurrenceCount: number;
}

/**
 * 공임 섹션 — JmCard 기반 인라인 추가/삭제.
 * 진단 선택되어 있으면 헤더 아래에 자주 쓰인 공임 추천 칩 노출.
 */
export function LaborsSection({
  ticketId,
  labors,
  readonly,
  onChanged,
  diagnosisTemplateId,
}: {
  ticketId: string;
  labors: RepairLabor[];
  readonly: boolean;
  onChanged: () => void;
  diagnosisTemplateId?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");

  // 진단 기반 공임 추천
  const recommendationsQuery = useQuery<{ labors: RecommendedLabor[] }>({
    queryKey: ["repairs", "diagnosis-recommendations", diagnosisTemplateId],
    queryFn: () =>
      apiGet<{ parts: unknown[]; labors: RecommendedLabor[] }>(
        `/api/repair-diagnosis-templates/${diagnosisTemplateId}/recommendations`,
      ),
    enabled: !!diagnosisTemplateId && !readonly,
    staleTime: 1000 * 60,
  });

  const add = useMutation({
    mutationFn: (input: { name: string; unitRate: number }) =>
      apiMutate(`/api/repair-tickets/${ticketId}/labors`, "POST", {
        name: input.name,
        hours: 1,
        unitRate: input.unitRate,
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
    <JmCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2">
          <span className="text-jm-base font-semibold text-[var(--jm-text)]">공임</span>
          <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
            {labors.length === 0 ? "—" : `${labors.length}건`}
          </span>
        </div>
        {!readonly && !adding && (
          <JmButton
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            공임
          </JmButton>
        )}
      </div>

      {/* 진단 기반 공임 추천 — 이름·단가 함께 표시, 클릭 시 즉시 추가 */}
      {!readonly && !adding && (recommendationsQuery.data?.labors.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-[var(--jm-border)] bg-[var(--jm-bg)] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[var(--jm-accent-fg)]" />
            <span className="text-jm-2xs font-semibold text-[var(--jm-accent-fg)]">
              이 진단에 자주 쓰인 공임
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(recommendationsQuery.data?.labors ?? []).map((r) => (
              <button
                key={r.name}
                type="button"
                disabled={add.isPending}
                onClick={() => add.mutate({ name: r.name, unitRate: r.unitRate })}
                className="flex items-center gap-1.5 rounded-full border border-[var(--jm-accent-bg)] bg-[var(--jm-surface)] px-3 py-1.5 text-jm-2xs transition-colors hover:bg-[var(--jm-accent-bg)] disabled:opacity-50"
              >
                <Plus className="size-3 text-[var(--jm-accent-fg)]" />
                <span className="line-clamp-1 max-w-[120px] text-[var(--jm-text)]">
                  {r.name}
                </span>
                <span className="text-[var(--jm-text-muted)] tabular-nums">
                  {fmtKRWInc(r.unitRate)}
                </span>
                <span className="text-[var(--jm-text-subtle)]">
                  {r.occurrenceCount}회
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {adding && !readonly && (
        <div className="border-b border-[var(--jm-border)] bg-[var(--jm-bg)] p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <JmInput
              autoFocus
              size="md"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="공임명 (예: 분해/조립)"
              className="flex-1"
            />
            <JmNumberInput
              value={rate}
              onValueChange={setRate}
              placeholder="₩ 금액"
              className="sm:w-36"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <JmButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setName("");
                setRate("");
              }}
            >
              취소
            </JmButton>
            <JmButton
              variant="cta"
              size="sm"
              disabled={!name.trim() || !rate || add.isPending}
              onClick={() =>
                add.mutate({
                  name: name.trim(),
                  unitRate: parseInt(rate.replace(/,/g, ""), 10) || 0,
                })
              }
            >
              {add.isPending ? "추가 중…" : "추가"}
            </JmButton>
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {labors.length === 0 ? (
          <div className="px-4 py-8 text-center text-jm-sm text-[var(--jm-text-subtle)] sm:px-5">
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
        <div className="flex justify-end border-t border-[var(--jm-border)] px-4 py-3 text-jm-sm sm:px-5">
          <span className="font-semibold tabular-nums text-[var(--jm-text)]">
            합계 {fmtKRWInc(total)}
          </span>
        </div>
      )}
    </JmCard>
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
    <div className="flex items-center justify-between gap-3 border-b border-[var(--jm-border)] px-4 py-3 last:border-b-0 sm:px-5">
      <span className="line-clamp-1 flex-1 text-jm-sm font-medium text-[var(--jm-text)]">
        {labor.name}
      </span>
      <button
        type="button"
        onClick={() => !readonly && setPriceOpen(true)}
        disabled={readonly}
        className="rounded-md px-2 py-1 text-right hover:bg-[var(--jm-bg)] disabled:hover:bg-transparent"
      >
        <span className="text-jm-sm font-semibold tabular-nums text-[var(--jm-text)]">
          {fmtKRWInc(labor.totalPrice)}
        </span>
      </button>
      {!readonly && (
        <JmIconButton
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="삭제"
        >
          <Trash2 className="size-4" />
        </JmIconButton>
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
