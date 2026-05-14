"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { JmCard } from "@/jm";
import { fmtKRWInc } from "./_helpers";
import type { RepairPart, RepairLabor } from "./_types";

interface RecSetPart {
  productId: string;
  name: string;
  sku: string;
  sellingPrice: string;
  avgQuantity: number;
}

interface RecSetLabor {
  name: string;
  unitRate: number;
}

interface RecSet {
  id: string;
  occurrenceCount: number;
  parts: RecSetPart[];
  labors: RecSetLabor[];
}

interface Recommendations {
  parts: unknown[];
  labors: unknown[];
  sets: RecSet[];
}

/**
 * 세트 추천 카드 — 진단 선택 시 자주 함께 들어간 부속+공임 묶음을 한 번에 적용.
 * Phase 4 — PICKED_UP 케이스에서 학습된 정확 세트 매칭. 부분 일치는 안 함.
 * 이미 카트에 들어 있는 부속/공임 과 정확히 같지 않으면 적용 가능.
 */
export function SetRecommendations({
  ticketId,
  diagnosisTemplateId,
  readonly,
  parts,
  labors,
  onApplied,
}: {
  ticketId: string;
  diagnosisTemplateId: string | null;
  readonly: boolean;
  parts: RepairPart[];
  labors: RepairLabor[];
  onApplied: () => void;
}) {
  const [applying, setApplying] = useState<string | null>(null);

  const recsQuery = useQuery<Recommendations>({
    queryKey: ["repairs", "diagnosis-recommendations", diagnosisTemplateId],
    queryFn: () =>
      apiGet<Recommendations>(
        `/api/repair-diagnosis-templates/${diagnosisTemplateId}/recommendations`,
      ),
    enabled: !!diagnosisTemplateId && !readonly,
    staleTime: 1000 * 60,
  });

  const applyMutation = useMutation({
    mutationFn: async (set: RecSet) => {
      // 부속 추가 (순차) — 같은 productId 중복 없게 이미 있는 건 skip
      const existingProductIds = new Set(parts.map((p) => p.productId));
      for (const p of set.parts) {
        if (existingProductIds.has(p.productId)) continue;
        await apiMutate(`/api/repair-tickets/${ticketId}/parts`, "POST", {
          productId: p.productId,
          quantity: Math.max(1, Math.round(p.avgQuantity)),
          unitPrice: parseFloat(p.sellingPrice) || 0,
        });
      }
      // 공임 추가 — 같은 name 이미 있으면 skip
      const existingLaborNames = new Set(labors.map((l) => l.name));
      for (const l of set.labors) {
        if (existingLaborNames.has(l.name)) continue;
        await apiMutate(`/api/repair-tickets/${ticketId}/labors`, "POST", {
          name: l.name,
          hours: 1,
          unitRate: l.unitRate,
        });
      }
    },
    onMutate: (set) => setApplying(set.id),
    onSuccess: () => {
      toast.success("세트 적용 완료");
      onApplied();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "세트 적용 실패"),
    onSettled: () => setApplying(null),
  });

  if (readonly || !diagnosisTemplateId) return null;
  const sets = recsQuery.data?.sets ?? [];
  if (sets.length === 0) return null;

  return (
    <JmCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--jm-border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-[var(--jm-accent-fg)]" />
          <span className="text-jm-base font-semibold text-[var(--jm-text)]">
            추천 세트
          </span>
          <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
            이 진단에 자주 사용된 묶음
          </span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-[var(--jm-border)]">
        {sets.map((set, idx) => {
          const partsTotal = set.parts.reduce(
            (s, p) => s + (parseFloat(p.sellingPrice) || 0) * (p.avgQuantity || 1),
            0,
          );
          const laborsTotal = set.labors.reduce(
            (s, l) => s + (l.unitRate || 0),
            0,
          );
          const total = partsTotal + laborsTotal;
          const isApplying = applying === set.id;
          return (
            <div key={set.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between">
                <span className="text-jm-sm font-semibold text-[var(--jm-text)]">
                  세트 #{idx + 1}
                </span>
                <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                  {set.occurrenceCount}회 사용
                </span>
              </div>
              {/* 부속 라인 */}
              {set.parts.length > 0 && (
                <div className="flex flex-col gap-0.5 text-jm-2xs">
                  {set.parts.map((p) => (
                    <div
                      key={p.productId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="line-clamp-1 text-[var(--jm-text)]">
                        부속 · {p.name}
                        <span className="ml-1 text-[var(--jm-text-subtle)]">
                          ×{Math.max(1, Math.round(p.avgQuantity))}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--jm-text-muted)]">
                        {fmtKRWInc((parseFloat(p.sellingPrice) || 0) * Math.max(1, Math.round(p.avgQuantity)))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* 공임 라인 */}
              {set.labors.length > 0 && (
                <div className="flex flex-col gap-0.5 text-jm-2xs">
                  {set.labors.map((l) => (
                    <div
                      key={l.name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="line-clamp-1 text-[var(--jm-text)]">
                        공임 · {l.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-[var(--jm-text-muted)]">
                        {fmtKRWInc(l.unitRate)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-jm-2xs text-[var(--jm-text-subtle)]">
                  추정 합계{" "}
                  <span className="font-semibold tabular-nums text-[var(--jm-text)]">
                    {fmtKRWInc(total)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => applyMutation.mutate(set)}
                  disabled={applyMutation.isPending}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--jm-accent-bg)] px-3 text-jm-2xs font-semibold text-[var(--jm-accent-fg)] hover:opacity-90 disabled:opacity-50"
                >
                  {isApplying && <Loader2 className="size-3 animate-spin" />}
                  세트 적용
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </JmCard>
  );
}
