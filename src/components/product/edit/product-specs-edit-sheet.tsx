"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
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
import type { ProductDetail, ProductSpecSlotItem } from "../types";

interface ProductSpecsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

interface SpecRow {
  rowId: string;
  slotId: string;
  slot: ProductSpecSlotItem;
  value: string;
}

export function ProductSpecsEditSheet(props: ProductSpecsEditSheetProps) {
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Content {...props} />}
    </JmDrawer>
  );
}

function Content({ onOpenChange, product }: ProductSpecsEditSheetProps) {
  const queryClient = useQueryClient();

  const slotsQuery = useQuery({
    queryKey: ["spec-slots", "active"],
    queryFn: () => apiGet<ProductSpecSlotItem[]>("/api/spec-slots?activeOnly=1"),
  });

  const [rows, setRows] = useState<SpecRow[]>(() =>
    (product.specValues ?? []).map((v) => ({
      rowId: Math.random().toString(36).slice(2),
      slotId: v.slotId,
      slot: v.slot,
      value: v.value,
    })),
  );

  const [addingSlotId, setAddingSlotId] = useState<string>("");

  const usedSlotIds = new Set(rows.map((r) => r.slotId));
  const availableSlots = (slotsQuery.data ?? []).filter((s) => !usedSlotIds.has(s.id));

  const handleAddSlot = (slotId: string) => {
    const slot = (slotsQuery.data ?? []).find((s) => s.id === slotId);
    if (!slot) return;
    setRows((prev) => [
      ...prev,
      {
        rowId: Math.random().toString(36).slice(2),
        slotId: slot.id,
        slot,
        value: slot.type === "ENUM" ? slot.options[0] ?? "" : "",
      },
    ]);
    setAddingSlotId("");
  };

  const updateValue = (rowId: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, value } : r)));
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const move = (rowId: string, dir: -1 | 1) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowId === rowId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      for (const r of rows) {
        if (!r.value.trim()) {
          throw new Error(`${r.slot.name}: 값을 입력해주세요`);
        }
        if (r.slot.type === "NUMBER" && isNaN(parseFloat(r.value))) {
          throw new Error(`${r.slot.name}: 숫자 값이어야 합니다`);
        }
        if (r.slot.type === "ENUM" && !r.slot.options.includes(r.value)) {
          throw new Error(`${r.slot.name}: 허용되지 않은 값입니다`);
        }
      }
      return apiMutate(`/api/products/${product.id}/specs`, "PUT", {
        values: rows.map((r, i) => ({
          slotId: r.slotId,
          value: r.value,
          order: i,
        })),
      });
    },
    onSuccess: () => {
      toast.success("스펙이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(product.id) });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장 실패"),
  });

  const slotOptions = availableSlots.map((s) => ({
    value: s.id,
    label: `${s.name}${s.type === "NUMBER" && s.unit ? ` (${s.unit})` : ""}`,
  }));

  return (
    <JmDrawerContent
      side="bottom"
      size="xl"
      className="flex flex-col p-0"
      dragHandle={false}
    >
      <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
        <JmDrawerTitle>상세 스펙 편집</JmDrawerTitle>
        <JmDrawerDescription className="text-jm-xs">
          슬롯을 추가하고 값을 입력하세요. 슬롯이 없다면 먼저 슬롯 관리에서 등록.
        </JmDrawerDescription>
      </JmDrawerHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 슬롯 추가 */}
          <div className="space-y-1.5">
            <label className="text-jm-sm text-[var(--jm-text-muted)]">슬롯 추가</label>
            <JmSelect
              size="sm"
              options={slotOptions}
              value={addingSlotId}
              onChange={(v) => v && handleAddSlot(v)}
              placeholder={
                availableSlots.length === 0
                  ? "추가 가능한 슬롯이 없습니다"
                  : "슬롯 선택..."
              }
            />
          </div>

          {/* 행 목록 */}
          {rows.length === 0 ? (
            <div className="text-center py-8 text-jm-sm text-[var(--jm-text-muted)]">
              슬롯을 추가하세요
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div
                  key={r.rowId}
                  className="flex items-end gap-2 border border-[var(--jm-border)] rounded-md p-2"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-jm-sm font-medium text-[var(--jm-text)]">
                        {r.slot.name}
                      </span>
                      {r.slot.type === "ENUM" && (
                        <JmBadge
                          variant="outline"
                          size="sm"
                          shape="square"
                          className="text-jm-2xs"
                        >
                          선택지
                        </JmBadge>
                      )}
                      {r.slot.type === "NUMBER" && r.slot.unit && (
                        <span className="text-jm-2xs text-[var(--jm-text-muted)]">
                          ({r.slot.unit})
                        </span>
                      )}
                    </div>
                    {r.slot.type === "ENUM" ? (
                      <JmSelect
                        size="sm"
                        options={r.slot.options.map((o) => ({ value: o, label: o }))}
                        value={r.value}
                        onChange={(v) => updateValue(r.rowId, v ?? "")}
                        placeholder="선택..."
                      />
                    ) : (
                      <JmInput
                        size="sm"
                        value={r.value}
                        onChange={(e) => updateValue(r.rowId, e.target.value)}
                        onFocus={focusCaretEnd}
                        inputMode={r.slot.type === "NUMBER" ? "decimal" : "text"}
                        placeholder={r.slot.type === "NUMBER" ? "숫자 입력" : "값 입력"}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <JmIconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => move(r.rowId, -1)}
                      title="위로"
                      aria-label="위로"
                    >
                      ↑
                    </JmIconButton>
                    <JmIconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === rows.length - 1}
                      onClick={() => move(r.rowId, 1)}
                      title="아래로"
                      aria-label="아래로"
                    >
                      ↓
                    </JmIconButton>
                  </div>
                  <JmIconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(r.rowId)}
                    aria-label="삭제"
                    className="text-[var(--jm-danger-fg)]"
                  >
                    <Trash2 />
                  </JmIconButton>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)]">
          <JmButton variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </JmButton>
          <JmButton
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
