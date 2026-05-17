"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatComma, parseComma } from "@/lib/utils";
import { diffSellingCosts, type CostInput } from "@/lib/product-mutations";
import {
  JmButton,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
  JmSelect,
} from "@/jm";
import type { ProductDetail, SellingCostItem } from "../types";

interface ProductCostsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
  /** null = 전사 / channelId = 채널 전용 */
  channelId?: string | null;
  channelName?: string;
}

export function ProductCostsEditSheet(props: ProductCostsEditSheetProps) {
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductCostsEditSheetContent {...props} />}
    </JmDrawer>
  );
}

interface CostRow extends CostInput {
  rowId: string;
}

const newRow = (): CostRow => ({
  rowId: Math.random().toString(36).slice(2),
  name: "",
  costType: "FIXED",
  value: "",
  perUnit: false,
  isTaxable: true,
});

const COST_TYPE_OPTIONS = [
  { value: "FIXED", label: "고정 금액" },
  { value: "PERCENTAGE", label: "비율 (%)" },
];

const PER_UNIT_OPTIONS = [
  { value: "true", label: "개당" },
  { value: "false", label: "건당" },
];

const TAX_OPTIONS = [
  { value: "true", label: "과세 (세금계산서)" },
  { value: "false", label: "면세" },
];

function ProductCostsEditSheetContent({
  onOpenChange,
  product,
  channelId = null,
  channelName,
}: ProductCostsEditSheetProps) {
  const queryClient = useQueryClient();

  const initialCosts: SellingCostItem[] = (product.sellingCosts ?? []).filter(
    (c) => c.channelId === channelId,
  );
  const [rows, setRows] = useState<CostRow[]>(() =>
    initialCosts.length > 0
      ? initialCosts.map((c) => ({
          rowId: Math.random().toString(36).slice(2),
          serverId: c.id,
          name: c.name,
          costType: c.costType as "FIXED" | "PERCENTAGE",
          value: String(c.value),
          perUnit: c.perUnit,
          isTaxable: c.isTaxable,
        }))
      : [newRow()],
  );

  const update = (rowId: string, patch: Partial<CostRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const prev: CostInput[] = initialCosts.map((c) => ({
        serverId: c.id,
        name: c.name,
        costType: c.costType as "FIXED" | "PERCENTAGE",
        value: String(c.value),
        perUnit: c.perUnit,
        isTaxable: c.isTaxable,
      }));
      const next: CostInput[] = rows.map((r) => ({
        serverId: r.serverId,
        name: r.name,
        costType: r.costType,
        value: r.value,
        perUnit: r.perUnit,
        isTaxable: r.isTaxable,
      }));
      const result = await diffSellingCosts(product.id, channelId, prev, next);
      if (result.failed.length > 0) {
        throw new Error(`일부 항목 실패: ${result.failed.join(", ")}`);
      }
    },
    onSuccess: () => {
      toast.success("판매비용이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다",
      ),
  });

  const title = channelId ? `${channelName ?? "채널"} 전용 판매비용` : "전사 판매비용";

  return (
    <JmDrawerContent
      side="bottom"
      size="xl"
      className="flex flex-col p-0"
      dragHandle={false}
    >
      <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
        <JmDrawerTitle>{title} 편집</JmDrawerTitle>
        <JmDrawerDescription className="text-jm-xs">
          비용 항목을 추가/수정/삭제합니다. FIXED 금액은 VAT 포함값으로 입력하면 원가
          계산 시 자동으로 공급가액 환산됩니다.
        </JmDrawerDescription>
      </JmDrawerHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row) => (
            <div
              key={row.rowId}
              className="rounded-md border border-[var(--jm-border)] p-3 space-y-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_auto] gap-2 items-end">
                <FieldSm label="비용 항목명">
                  <JmInput
                    size="sm"
                    value={row.name}
                    onChange={(e) => update(row.rowId, { name: e.target.value })}
                    onFocus={focusCaretEnd}
                    placeholder="예: 포장비, 완충재"
                  />
                </FieldSm>
                <FieldSm label="유형">
                  <JmSelect
                    size="sm"
                    options={COST_TYPE_OPTIONS}
                    value={row.costType}
                    onChange={(v) =>
                      update(row.rowId, {
                        costType: (v ?? row.costType) as "FIXED" | "PERCENTAGE",
                      })
                    }
                  />
                </FieldSm>
                <FieldSm label={row.costType === "FIXED" ? "금액 (VAT포함)" : "비율(%)"}>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode={row.costType === "FIXED" ? "numeric" : "decimal"}
                    value={
                      row.costType === "FIXED" ? formatComma(row.value) : row.value
                    }
                    onChange={(e) => {
                      const v =
                        row.costType === "FIXED"
                          ? parseComma(e.target.value)
                          : e.target.value;
                      update(row.rowId, { value: v });
                    }}
                    onFocus={focusCaretEnd}
                  />
                </FieldSm>
                <JmIconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.rowId)}
                  aria-label="행 삭제"
                  className="text-[var(--jm-danger-fg)]"
                >
                  <Trash2 />
                </JmIconButton>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FieldSm label="적용 단위">
                  <JmSelect
                    size="sm"
                    options={PER_UNIT_OPTIONS}
                    value={row.perUnit ? "true" : "false"}
                    onChange={(v) =>
                      update(row.rowId, { perUnit: v === "true" })
                    }
                  />
                </FieldSm>
                <FieldSm label="과세 여부">
                  <JmSelect
                    size="sm"
                    options={TAX_OPTIONS}
                    value={row.isTaxable ? "true" : "false"}
                    onChange={(v) =>
                      update(row.rowId, { isTaxable: v === "true" })
                    }
                  />
                </FieldSm>
              </div>
            </div>
          ))}

          <JmButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
          >
            <Plus />
            <span>비용 항목 추가</span>
          </JmButton>
        </div>

        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            취소
          </JmButton>
          <JmButton
            type="button"
            variant="cta"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            <span>저장</span>
          </JmButton>
        </div>
      </div>
    </JmDrawerContent>
  );
}

function FieldSm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-jm-xs text-[var(--jm-text-muted)]">{label}</label>
      {children}
    </div>
  );
}
