"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ApiError, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { ProductDetail, ProductOptionItem } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

/** 옵션 슬롯 드래프트 — 신규/기존 모두 동일 형태 */
interface OptionDraft {
  rowId: string; // 클라이언트 임시 키
  id?: string; // DB id (있으면 PATCH, 없으면 POST)
  name: string;
  required: boolean;
  values: ValueDraft[];
}

interface ValueDraft {
  rowId: string;
  id?: string;
  label: string;
  addPrice: string;
  mappedProductId: string | null;
  mappedVariantId: string | null;
}

const tmpId = () => Math.random().toString(36).slice(2);

function fromOption(opt: ProductOptionItem): OptionDraft {
  return {
    rowId: tmpId(),
    id: opt.id,
    name: opt.name,
    required: opt.required,
    values: opt.values.map((v) => ({
      rowId: tmpId(),
      id: v.id,
      label: v.label,
      addPrice: String(v.addPrice ?? "0"),
      mappedProductId: v.mappedProductId,
      mappedVariantId: v.mappedVariantId,
    })),
  };
}

function emptyOption(): OptionDraft {
  return {
    rowId: tmpId(),
    name: "",
    required: true,
    values: [
      {
        rowId: tmpId(),
        label: "",
        addPrice: "0",
        mappedProductId: null,
        mappedVariantId: null,
      },
    ],
  };
}

export function ProductOptionsEditSheet(props: Props) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Body {...props} />}
    </Sheet>
  );
}

function Body({ product, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    (product.productOptions ?? []).map(fromOption),
  );

  const createMutation = useMutation({
    mutationFn: (draft: OptionDraft) =>
      apiMutate(`/api/products/${product.id}/options`, "POST", {
        name: draft.name.trim(),
        required: draft.required,
        sortOrder: 0,
        isActive: true,
        values: draft.values.map((v, idx) => ({
          label: v.label.trim(),
          addPrice: parseFloat(v.addPrice || "0") || 0,
          sortOrder: idx,
          isActive: true,
          mappedProductId: v.mappedProductId,
          mappedVariantId: v.mappedVariantId,
        })),
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ draft }: { draft: OptionDraft }) =>
      apiMutate(`/api/products/${product.id}/options/${draft.id}`, "PATCH", {
        name: draft.name.trim(),
        required: draft.required,
        values: draft.values.map((v, idx) => ({
          ...(v.id ? { id: v.id } : {}),
          label: v.label.trim(),
          addPrice: parseFloat(v.addPrice || "0") || 0,
          sortOrder: idx,
          isActive: true,
          mappedProductId: v.mappedProductId,
          mappedVariantId: v.mappedVariantId,
        })),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (optionId: string) =>
      apiMutate(`/api/products/${product.id}/options/${optionId}`, "DELETE"),
  });

  const submitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const addOption = () => setDrafts((prev) => [...prev, emptyOption()]);
  const removeOption = (rowId: string) =>
    setDrafts((prev) => prev.filter((d) => d.rowId !== rowId));

  const updateOption = (rowId: string, patch: Partial<OptionDraft>) =>
    setDrafts((prev) =>
      prev.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d)),
    );

  const addValue = (optionRowId: string) =>
    setDrafts((prev) =>
      prev.map((d) =>
        d.rowId === optionRowId
          ? {
              ...d,
              values: [
                ...d.values,
                {
                  rowId: tmpId(),
                  label: "",
                  addPrice: "0",
                  mappedProductId: null,
                  mappedVariantId: null,
                },
              ],
            }
          : d,
      ),
    );

  const removeValue = (optionRowId: string, valueRowId: string) =>
    setDrafts((prev) =>
      prev.map((d) =>
        d.rowId === optionRowId
          ? {
              ...d,
              values: d.values.filter((v) => v.rowId !== valueRowId),
            }
          : d,
      ),
    );

  const updateValue = (
    optionRowId: string,
    valueRowId: string,
    patch: Partial<ValueDraft>,
  ) =>
    setDrafts((prev) =>
      prev.map((d) =>
        d.rowId === optionRowId
          ? {
              ...d,
              values: d.values.map((v) =>
                v.rowId === valueRowId ? { ...v, ...patch } : v,
              ),
            }
          : d,
      ),
    );

  const handleSubmit = async () => {
    // 검증
    for (const d of drafts) {
      if (!d.name.trim()) {
        toast.error("옵션 슬롯명을 입력하세요");
        return;
      }
      if (d.values.length === 0) {
        toast.error(`${d.name}: 최소 1개 옵션값이 필요합니다`);
        return;
      }
      for (const v of d.values) {
        if (!v.label.trim()) {
          toast.error(`${d.name}: 옵션값 라벨을 입력하세요`);
          return;
        }
        if (v.mappedProductId && v.mappedVariantId) {
          toast.error(
            `${d.name} > ${v.label}: Product / Variant 매핑 둘 중 하나만 설정`,
          );
          return;
        }
      }
    }

    // 기존 옵션 중 drafts 에서 삭제된 것 — 서버에 DELETE
    const existingIds = new Set(
      (product.productOptions ?? []).map((o) => o.id),
    );
    const draftIds = new Set(
      drafts.map((d) => d.id).filter((id): id is string => !!id),
    );
    const toDelete = [...existingIds].filter((id) => !draftIds.has(id));

    try {
      for (const id of toDelete) {
        await deleteMutation.mutateAsync(id);
      }
      for (const d of drafts) {
        if (d.id) {
          await updateMutation.mutateAsync({ draft: d });
        } else {
          await createMutation.mutateAsync(d);
        }
      }
      toast.success("옵션이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "저장 실패");
    }
  };

  return (
    <SheetContent
      side="right"
      className="w-full sm:max-w-[600px] flex flex-col p-0"
    >
      <SheetHeader className="px-5 py-4 border-b">
        <SheetTitle>고객 옵션 편집 — {product.name}</SheetTitle>
        <SheetDescription>
          고객이 카탈로그·POS 에서 선택하는 옵션 슬롯을 정의합니다. 매장 분기
          (variant) 와 별도 도메인.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {drafts.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            등록된 옵션이 없습니다. 아래 [옵션 슬롯 추가] 클릭해 시작하세요.
          </div>
        )}

        {drafts.map((draft) => (
          <div
            key={draft.rowId}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">옵션 슬롯명</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    updateOption(draft.rowId, { name: e.target.value })
                  }
                  placeholder="예: 색상, 용량, 메모리"
                  className="h-9"
                />
              </div>
              <label className="flex items-center gap-1.5 px-2 h-9 text-xs">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) =>
                    updateOption(draft.rowId, { required: e.target.checked })
                  }
                />
                필수
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 text-destructive"
                onClick={() => removeOption(draft.rowId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">옵션값</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => addValue(draft.rowId)}
                >
                  <Plus className="h-3 w-3 mr-1" /> 값 추가
                </Button>
              </div>

              {draft.values.map((v) => (
                <div
                  key={v.rowId}
                  className="grid grid-cols-[1fr_120px_140px_auto] items-center gap-2 rounded-md border bg-background p-2"
                >
                  <Input
                    value={v.label}
                    onChange={(e) =>
                      updateValue(draft.rowId, v.rowId, {
                        label: e.target.value,
                      })
                    }
                    placeholder="라벨 (화이트, 32GB, 수냉)"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={v.addPrice}
                    onChange={(e) =>
                      updateValue(draft.rowId, v.rowId, {
                        addPrice: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                    placeholder="추가가"
                    className="h-8 text-xs tabular-nums"
                  />
                  <MappingPicker
                    value={v}
                    onChange={(patch) =>
                      updateValue(draft.rowId, v.rowId, patch)
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => removeValue(draft.rowId, v.rowId)}
                    disabled={draft.values.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full h-10"
          onClick={addOption}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> 옵션 슬롯 추가
        </Button>
      </div>

      <div className="border-t px-5 py-4 flex justify-end gap-2 bg-background">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          취소
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
          저장
        </Button>
      </div>
    </SheetContent>
  );
}

/**
 * 매핑 picker — 단순 텍스트 / Product 매핑 / Variant 매핑 토글.
 * MVP 로 매핑 ID 직접 입력 (후속 PR 에서 Combobox 로 교체).
 */
function MappingPicker({
  value,
  onChange,
}: {
  value: ValueDraft;
  onChange: (patch: Partial<ValueDraft>) => void;
}) {
  const mode: "text" | "product" | "variant" = value.mappedProductId
    ? "product"
    : value.mappedVariantId
      ? "variant"
      : "text";

  const cycleMode = () => {
    if (mode === "text") {
      onChange({ mappedProductId: "", mappedVariantId: null });
    } else if (mode === "product") {
      onChange({ mappedProductId: null, mappedVariantId: "" });
    } else {
      onChange({ mappedProductId: null, mappedVariantId: null });
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="text-[10px] px-1.5 py-0.5 rounded border bg-secondary hover:bg-secondary/80 inline-flex items-center gap-0.5"
        onClick={cycleMode}
        title="매핑 모드 전환 (텍스트 / Product / Variant)"
      >
        {mode === "text" ? "텍스트" : mode === "product" ? "Product" : "Variant"}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {mode !== "text" && (
        <Input
          value={
            mode === "product"
              ? (value.mappedProductId ?? "")
              : (value.mappedVariantId ?? "")
          }
          onChange={(e) =>
            mode === "product"
              ? onChange({ mappedProductId: e.target.value || null })
              : onChange({ mappedVariantId: e.target.value || null })
          }
          placeholder="ID"
          className="h-7 text-[10px] font-mono w-[80px]"
        />
      )}
    </div>
  );
}
