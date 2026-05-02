"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
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
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Content {...props} />}
    </Sheet>
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
      // 검증
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

  return (
    <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
      <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
        <SheetTitle>상세 스펙 편집</SheetTitle>
        <SheetDescription className="text-xs">
          슬롯을 추가하고 값을 입력하세요. 슬롯이 없다면 먼저 슬롯 관리에서 등록.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 슬롯 추가 */}
          <div className="space-y-1.5">
            <Label>슬롯 추가</Label>
            <div className="flex gap-2">
              <Select value={addingSlotId} onValueChange={(v) => v && handleAddSlot(v)}>
                <SelectTrigger className="!h-9 w-full">
                  <SelectValue placeholder={availableSlots.length === 0 ? "추가 가능한 슬롯이 없습니다" : "슬롯 선택..."} />
                </SelectTrigger>
                <SelectContent>
                  {availableSlots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.type === "NUMBER" && s.unit && (
                        <span className="ml-1 text-xs text-muted-foreground">({s.unit})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 행 목록 */}
          {rows.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              슬롯을 추가하세요
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.rowId} className="flex items-end gap-2 border border-border rounded-md p-2">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{r.slot.name}</span>
                      {r.slot.type === "ENUM" && (
                        <Badge variant="outline" className="text-[10px]">선택지</Badge>
                      )}
                      {r.slot.type === "NUMBER" && r.slot.unit && (
                        <span className="text-[11px] text-muted-foreground">({r.slot.unit})</span>
                      )}
                    </div>
                    {r.slot.type === "ENUM" ? (
                      <Select value={r.value} onValueChange={(v) => updateValue(r.rowId, v ?? "")}>
                        <SelectTrigger className="!h-9">
                          <SelectValue placeholder="선택..." />
                        </SelectTrigger>
                        <SelectContent>
                          {r.slot.options.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={r.value}
                        onChange={(e) => updateValue(r.rowId, e.target.value)}
                        inputMode={r.slot.type === "NUMBER" ? "decimal" : "text"}
                        placeholder={r.slot.type === "NUMBER" ? "숫자 입력" : "값 입력"}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => move(r.rowId, -1)}
                      title="위로"
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === rows.length - 1}
                      onClick={() => move(r.rowId, 1)}
                      title="아래로"
                    >
                      ↓
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeRow(r.rowId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            저장
          </Button>
        </div>
      </div>
    </SheetContent>
  );
}
