"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2 } from "lucide-react";

import { apiMutate, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import {
  jmToast as toast,
  JmButton,
  JmCard,
  JmCardContent,
  JmCardHeader,
  JmCardTitle,
  JmFormField,
  JmIconButton,
  JmInput,
  JmSelect,
} from "@/jm";

import {
  USED_ITEM_COST_TYPE_LABEL,
  type UsedItemCost,
  type UsedItemCostType,
} from "./_types";

interface Props {
  usedItemId: string;
  costs: UsedItemCost[];
  /** SCRAPPED 등 상태에선 추가/삭제 비활성 */
  disabled?: boolean;
}

const TYPE_OPTIONS = (
  ["PART", "LABOR", "OTHER"] as UsedItemCostType[]
).map((v) => ({ value: v, label: USED_ITEM_COST_TYPE_LABEL[v] }));

const EMPTY_FORM = {
  costType: "PART" as UsedItemCostType,
  amount: "",
  description: "",
};

export function UsedItemCostList({ usedItemId, costs, disabled }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  const total = costs.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);

  const addMutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/used-items/${usedItemId}/costs`, "POST", form),
    onSuccess: () => {
      toast.success("비용이 추가되었습니다");
      setForm(EMPTY_FORM);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "추가에 실패했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: (costId: string) =>
      apiMutate(`/api/used-items/${usedItemId}/costs/${costId}`, "DELETE"),
    onSuccess: () => {
      toast.success("비용이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.usedItems.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "삭제에 실패했습니다"),
  });

  const handleAdd = () => {
    if (!form.amount.trim()) {
      toast.error("금액을 입력해주세요");
      return;
    }
    if (!form.description.trim()) {
      toast.error("설명을 입력해주세요");
      return;
    }
    addMutation.mutate();
  };

  return (
    <JmCard>
      <JmCardHeader>
        <JmCardTitle>사후 비용 가산</JmCardTitle>
      </JmCardHeader>
      <JmCardContent className="space-y-3">
        {costs.length === 0 ? (
          <p className="text-jm-sm text-[var(--jm-text-muted)]">
            가산된 비용이 없습니다
          </p>
        ) : (
          <ul className="space-y-2">
            {costs.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-jm-sm">
                    <span className="text-[var(--jm-text-muted)]">
                      {USED_ITEM_COST_TYPE_LABEL[c.costType]}
                    </span>
                    <span className="text-[var(--jm-text)] truncate">
                      {c.description}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-jm-sm font-semibold tabular-nums">
                  ₩{parseFloat(c.amount).toLocaleString("ko-KR")}
                </span>
                {!disabled && (
                  <JmIconButton
                    size="sm"
                    aria-label="삭제"
                    onClick={() => deleteMutation.mutate(c.id)}
                    disabled={
                      deleteMutation.isPending &&
                      deleteMutation.variables === c.id
                    }
                  >
                    {deleteMutation.isPending &&
                    deleteMutation.variables === c.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </JmIconButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {costs.length > 0 && (
          <div className="flex items-baseline justify-between border-t border-[var(--jm-border)] pt-2 text-jm-sm">
            <span className="text-[var(--jm-text-muted)]">합계</span>
            <span className="font-bold tabular-nums">
              ₩{total.toLocaleString("ko-KR")}
            </span>
          </div>
        )}

        {!disabled && (
          <>
            {adding ? (
              <div className="space-y-2 rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <JmFormField label="종류">
                    <JmSelect
                      value={form.costType}
                      onChange={(v) =>
                        setForm({ ...form, costType: v as UsedItemCostType })
                      }
                      options={TYPE_OPTIONS}
                    />
                  </JmFormField>
                  <JmFormField label="금액">
                    <JmInput
                      type="text"
                      inputMode="numeric"
                      value={formatComma(form.amount)}
                      onChange={(e) =>
                        setForm({ ...form, amount: parseComma(e.target.value) })
                      }
                      placeholder="0"
                    />
                  </JmFormField>
                  <JmFormField label="설명" className="sm:col-span-1">
                    <JmInput
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      placeholder="예: SSD 교체"
                    />
                  </JmFormField>
                </div>
                <div className="flex justify-end gap-1.5">
                  <JmButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm(EMPTY_FORM);
                      setAdding(false);
                    }}
                  >
                    취소
                  </JmButton>
                  <JmButton
                    size="sm"
                    onClick={handleAdd}
                    disabled={addMutation.isPending}
                  >
                    {addMutation.isPending && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    추가
                  </JmButton>
                </div>
              </div>
            ) : (
              <JmButton
                variant="outline"
                size="sm"
                onClick={() => setAdding(true)}
                className="w-full"
              >
                <Plus className="size-3.5" />
                비용 추가
              </JmButton>
            )}
          </>
        )}
      </JmCardContent>
    </JmCard>
  );
}
