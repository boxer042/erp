"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Wrench } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { JmButton, JmCard, JmIconButton, JmInput, JmNumberInput } from "@/jm";
import { fmtKRWInc } from "./_helpers";
import type { RepairLabor } from "./_types";
import { useRepairMutations } from "./_use-repair-mutations";
import { BottomSheet } from "@/app/(pos)/pos/_components/bottom-sheet";
import { PriceInputDialog } from "@/app/(pos)/pos/_components/price-input-dialog";

interface RecommendedLabor {
  name: string;
  unitRate: number;
  occurrenceCount: number;
}

interface Props {
  ticketId: string;
  labors: RepairLabor[];
  readonly: boolean;
  /** 호환용 — optimistic 훅이 캐시를 직접 patch 하므로 사용 안 함 */
  onChanged?: () => void;
  diagnosisTemplateId?: string | null;
}

/**
 * 공임 섹션 (가로카드 리뉴얼) — 추천을 정사각 가로카드로 1탭 추가.
 * [+직접추가] = 자유 입력 모달(이름+가격). 부속과 동일 패러다임, 전부 optimistic.
 */
export function LaborsSection({ ticketId, labors, readonly, diagnosisTemplateId }: Props) {
  const m = useRepairMutations(ticketId);
  const [addOpen, setAddOpen] = useState(false);

  const recommendationsQuery = useQuery<{ labors: RecommendedLabor[] }>({
    queryKey: ["repairs", "diagnosis-recommendations", diagnosisTemplateId],
    queryFn: () =>
      apiGet<{ parts: unknown[]; labors: RecommendedLabor[] }>(
        `/api/repair-diagnosis-templates/${diagnosisTemplateId}/recommendations`,
      ),
    enabled: !!diagnosisTemplateId && !readonly,
    staleTime: 1000 * 60,
  });

  const addedNames = new Set(labors.map((l) => l.name));
  const recs = (recommendationsQuery.data?.labors ?? []).filter((r) => !addedNames.has(r.name));

  const total = labors.reduce((s, l) => s + Number(l.totalPrice), 0);

  return (
    <>
      <JmCard className="overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <span className="text-jm-base font-semibold text-[var(--jm-text)]">공임</span>
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
              {labors.length === 0 ? "여러 개" : `${labors.length}건`}
            </span>
          </div>
          {diagnosisTemplateId && recs.length > 0 && (
            <span className="text-jm-2xs text-[var(--jm-text-subtle)]">진단 추천순</span>
          )}
        </div>

        {/* 가로 카드 — [+직접추가] + 추천(1탭) */}
        {!readonly && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] text-[var(--jm-text-muted)] transition-colors active:bg-[var(--jm-border)]"
            >
              <Plus className="size-5" />
              <span className="text-jm-2xs font-medium">직접추가</span>
            </button>

            {recs.map((r) => (
              <button
                key={r.name}
                type="button"
                disabled={m.addLabor.isPending}
                onClick={() => m.addLabor.mutate({ name: r.name, unitRate: r.unitRate })}
                className="relative flex h-[88px] w-[76px] shrink-0 flex-col items-center justify-between rounded-xl border border-[var(--jm-border)] bg-[var(--jm-surface)] p-1.5 text-center transition-colors active:bg-[var(--jm-surface-muted)] disabled:opacity-50"
              >
                <span className="absolute right-1 top-1 rounded bg-[var(--jm-accent-bg)] px-1 text-jm-3xs font-semibold text-[var(--jm-accent-fg)]">
                  {r.occurrenceCount}
                </span>
                <Wrench className="size-5 shrink-0 text-[var(--jm-text-muted)]" />
                <span className="line-clamp-2 text-jm-3xs leading-tight text-[var(--jm-text)]">
                  {r.name}
                </span>
                <span className="text-jm-3xs font-semibold tabular-nums text-[var(--jm-text-muted)]">
                  {fmtKRWInc(r.unitRate)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 추가됨 목록 */}
        {labors.length > 0 && (
          <div className="flex flex-col border-t border-[var(--jm-border)]">
            {labors.map((l) => (
              <LaborRow key={l.id} labor={l} readonly={readonly} m={m} />
            ))}
          </div>
        )}

        {labors.length > 0 && (
          <div className="flex justify-end border-t border-[var(--jm-border)] px-4 py-3 text-jm-sm sm:px-5">
            <span className="font-semibold tabular-nums text-[var(--jm-text)]">
              합계 {fmtKRWInc(total)}
            </span>
          </div>
        )}
      </JmCard>

      {addOpen && (
        <LaborAddSheet
          onClose={() => setAddOpen(false)}
          onAdd={(name, unitRate) => {
            m.addLabor.mutate({ name, unitRate });
            setAddOpen(false);
          }}
        />
      )}
    </>
  );
}

function LaborAddSheet({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, unitRate: number) => void;
}) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const canAdd = name.trim().length > 0 && !!rate;

  return (
    <BottomSheet
      open
      onOpenChange={(v) => !v && onClose()}
      title="공임 직접 추가"
      footer={
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => onAdd(name.trim(), parseInt(rate.replace(/,/g, ""), 10) || 0)}
          className="h-14 w-full rounded-2xl bg-[var(--jm-action)] text-jm-lg font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          추가
        </button>
      }
    >
      <div className="flex flex-col gap-3 pt-2">
        <JmInput
          autoFocus
          size="md"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="공임명 (예: 분해/조립)"
        />
        <JmNumberInput value={rate} onValueChange={setRate} placeholder="₩ 금액 (공급가액)" />
        <p className="text-jm-2xs text-[var(--jm-text-muted)]">
          공임은 항상 과세(VAT 10%) — 입력은 공급가액(세전) 기준입니다.
        </p>
      </div>
    </BottomSheet>
  );
}

function LaborRow({
  labor,
  readonly,
  m,
}: {
  labor: RepairLabor;
  readonly: boolean;
  m: ReturnType<typeof useRepairMutations>;
}) {
  const [priceOpen, setPriceOpen] = useState(false);

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
          onClick={() => m.deleteLabor.mutate(labor.id)}
          disabled={m.deleteLabor.isPending}
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
        onSubmit={(net) => m.updateLabor.mutate({ laborId: labor.id, unitRate: net })}
      />
    </div>
  );
}
