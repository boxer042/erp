"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import {
  JmButton,
  JmCheckbox,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
} from "@/jm";
import type { ProductDetail, ProductOptionItem } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

interface OptionDraft {
  rowId: string;
  id?: string;
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
  mappedMode: "SWAP" | "ADDON";
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
      mappedMode: v.mappedMode ?? "SWAP",
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
        mappedMode: "SWAP",
      },
    ],
  };
}

export function ProductOptionsEditSheet(props: Props) {
  return (
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Body {...props} />}
    </JmDrawer>
  );
}

function Body({ product, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    (product.productOptions ?? []).map(fromOption),
  );

  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ["option-mapping-products"],
    queryFn: () =>
      apiGet<ProductOption[]>(
        "/api/products?excludeVariants=true&includeHidden=1",
      ),
  });
  const productCandidates = useMemo(() => {
    const all = productsQuery.data ?? [];
    return all.filter(
      (p) => p.id !== product.id && p.productType !== "OPTION_PARENT",
    );
  }, [productsQuery.data, product.id]);
  const variantCandidates = useMemo(() => {
    const all = productsQuery.data ?? [];
    return all.filter((p) => !!p.canonicalProductId);
  }, [productsQuery.data]);

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
          mappedMode: v.mappedMode,
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
          mappedMode: v.mappedMode,
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
                  mappedMode: "SWAP" as const,
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
    <JmDrawerContent
      side="right"
      size="xl"
      className="flex flex-col p-0"
      dragHandle={false}
    >
      <JmDrawerHeader className="px-5 py-4 border-b border-[var(--jm-border)]">
        <JmDrawerTitle>고객 옵션 편집 — {product.name}</JmDrawerTitle>
        <JmDrawerDescription>
          고객이 카탈로그·POS 에서 선택하는 옵션 슬롯을 정의합니다. 매장 분기
          (variant) 와 별도 도메인.
        </JmDrawerDescription>
      </JmDrawerHeader>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {drafts.length === 0 && (
          <div className="text-center text-jm-sm text-[var(--jm-text-muted)] py-8">
            등록된 옵션이 없습니다. 아래 [옵션 슬롯 추가] 클릭해 시작하세요.
          </div>
        )}

        {drafts.map((draft) => (
          <div
            key={draft.rowId}
            className="rounded-lg border border-[var(--jm-border)] bg-[var(--jm-surface)] p-4 space-y-3"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">
                  옵션 슬롯명
                </label>
                <JmInput
                  size="sm"
                  value={draft.name}
                  onChange={(e) =>
                    updateOption(draft.rowId, { name: e.target.value })
                  }
                  onFocus={focusCaretEnd}
                  placeholder="예: 색상, 용량, 메모리"
                />
              </div>
              <label className="flex items-center gap-1.5 px-2 h-9 text-jm-xs text-[var(--jm-text)] cursor-pointer">
                <JmCheckbox
                  checked={draft.required}
                  onCheckedChange={(c) =>
                    updateOption(draft.rowId, { required: c === true })
                  }
                />
                필수
              </label>
              <JmIconButton
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeOption(draft.rowId)}
                aria-label="옵션 삭제"
                className="text-[var(--jm-danger-fg)]"
              >
                <Trash2 />
              </JmIconButton>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">옵션값</label>
                <JmButton
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addValue(draft.rowId)}
                >
                  <Plus />
                  <span>값 추가</span>
                </JmButton>
              </div>

              {draft.values.map((v) => (
                <div
                  key={v.rowId}
                  className="grid grid-cols-[1fr_120px_140px_auto] items-center gap-2 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-2"
                >
                  <JmInput
                    size="sm"
                    value={v.label}
                    onChange={(e) =>
                      updateValue(draft.rowId, v.rowId, {
                        label: e.target.value,
                      })
                    }
                    onFocus={focusCaretEnd}
                    placeholder="라벨 (화이트, 32GB, 수냉)"
                    className="text-jm-xs"
                  />
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="numeric"
                    value={v.addPrice}
                    onChange={(e) =>
                      updateValue(draft.rowId, v.rowId, {
                        addPrice: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                    onFocus={focusCaretEnd}
                    placeholder="추가가"
                    className="text-jm-xs tabular-nums"
                  />
                  <MappingPicker
                    value={v}
                    onChange={(patch) =>
                      updateValue(draft.rowId, v.rowId, patch)
                    }
                    productCandidates={productCandidates}
                    variantCandidates={variantCandidates}
                    productsLoading={productsQuery.isPending}
                  />
                  <JmIconButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeValue(draft.rowId, v.rowId)}
                    disabled={draft.values.length === 1}
                    aria-label="옵션값 삭제"
                    className="text-[var(--jm-danger-fg)]"
                  >
                    <Trash2 />
                  </JmIconButton>
                </div>
              ))}
            </div>
          </div>
        ))}

        <JmButton
          type="button"
          variant="outline"
          className="w-full h-10"
          onClick={addOption}
        >
          <Plus />
          <span>옵션 슬롯 추가</span>
        </JmButton>
      </div>

      <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)]">
        <JmButton
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          취소
        </JmButton>
        <JmButton
          type="button"
          variant="cta"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          <span>저장</span>
        </JmButton>
      </div>
    </JmDrawerContent>
  );
}

function MappingPicker({
  value,
  onChange,
  productCandidates,
  variantCandidates,
  productsLoading,
}: {
  value: ValueDraft;
  onChange: (patch: Partial<ValueDraft>) => void;
  productCandidates: ProductOption[];
  variantCandidates: ProductOption[];
  productsLoading: boolean;
}) {
  const mode: "text" | "product" | "variant" = value.mappedProductId
    ? "product"
    : value.mappedVariantId
      ? "variant"
      : "text";

  const cycleMode = () => {
    if (mode === "text") {
      onChange({ mappedProductId: "", mappedVariantId: null, mappedMode: "SWAP" });
    } else if (mode === "product") {
      onChange({ mappedProductId: null, mappedVariantId: "" });
    } else {
      onChange({ mappedProductId: null, mappedVariantId: null });
    }
  };

  const toggleMappedMode = () =>
    onChange({ mappedMode: value.mappedMode === "SWAP" ? "ADDON" : "SWAP" });

  return (
    <div className="flex flex-col items-stretch gap-1 min-w-[220px]">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-jm-2xs px-1.5 py-0.5 rounded border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] hover:bg-[var(--jm-surface-muted)]/80 text-[var(--jm-text)] inline-flex items-center gap-0.5 shrink-0 transition-colors"
          onClick={cycleMode}
          title="매핑 모드 전환 (텍스트 / Product / Variant)"
        >
          {mode === "text" ? "텍스트" : mode === "product" ? "Product" : "Variant"}
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
        {mode === "product" && (
          <div className="flex-1 min-w-0">
            <ProductCombobox
              products={productCandidates}
              value={value.mappedProductId ?? ""}
              onChange={(p) => onChange({ mappedProductId: p.id })}
              placeholder={productsLoading ? "로딩…" : "상품 선택"}
              clearable={false}
            />
          </div>
        )}
        {mode === "variant" && (
          <div className="flex-1 min-w-0">
            <ProductCombobox
              products={variantCandidates}
              value={value.mappedVariantId ?? ""}
              onChange={(p) => onChange({ mappedVariantId: p.id })}
              placeholder={
                productsLoading
                  ? "로딩…"
                  : variantCandidates.length === 0
                    ? "변형 없음"
                    : "변형 선택"
              }
              clearable={false}
            />
          </div>
        )}
      </div>
      {mode === "product" && (
        <button
          type="button"
          onClick={toggleMappedMode}
          title={
            value.mappedMode === "SWAP"
              ? "SWAP — 옵션 선택 시 메인 라인 productId 가 매핑된 SKU 로 교체됨 (색상·사이즈 변형)"
              : "ADDON — 옵션 선택 시 자식 OrderItem 자동 추가됨 (메인 + 부속 결제). 일반 추가구매는 BundleProduct 도메인 권장"
          }
          className="text-jm-2xs px-1.5 py-0.5 rounded border border-[var(--jm-border)] inline-flex items-center justify-center gap-0.5 bg-[var(--jm-bg)] hover:bg-[var(--jm-surface-muted)]/40 text-[var(--jm-text)] self-start transition-colors"
        >
          모드: <span className="font-semibold">{value.mappedMode}</span>
        </button>
      )}
    </div>
  );
}
