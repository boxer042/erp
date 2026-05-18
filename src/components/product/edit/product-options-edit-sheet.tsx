"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
  JmSegmentedControl,
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
                <OptionValueEditor
                  key={v.rowId}
                  value={v}
                  onChange={(patch) => updateValue(draft.rowId, v.rowId, patch)}
                  onRemove={() => removeValue(draft.rowId, v.rowId)}
                  canRemove={draft.values.length > 1}
                  productCandidates={productCandidates}
                  variantCandidates={variantCandidates}
                  productsLoading={productsQuery.isPending}
                />
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

type LinkType = "text" | "swap" | "addon" | "variant";

/** 옵션값 1개 편집 — 라벨 + 연결 방식(세그먼트) + 단품/변형 선택 + 추가가 */
function OptionValueEditor({
  value,
  onChange,
  onRemove,
  canRemove,
  productCandidates,
  variantCandidates,
  productsLoading,
}: {
  value: ValueDraft;
  onChange: (patch: Partial<ValueDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
  productCandidates: ProductOption[];
  variantCandidates: ProductOption[];
  productsLoading: boolean;
}) {
  // mappedProductId 가 "" 든 실제 id 든 null 만 아니면 product 연결 상태
  const linkType: LinkType =
    value.mappedProductId !== null
      ? value.mappedMode === "ADDON"
        ? "addon"
        : "swap"
      : value.mappedVariantId !== null
        ? "variant"
        : "text";

  const setLinkType = (t: LinkType) => {
    if (t === "text") {
      onChange({ mappedProductId: null, mappedVariantId: null });
    } else if (t === "swap") {
      onChange({
        mappedProductId: value.mappedProductId ?? "",
        mappedVariantId: null,
        mappedMode: "SWAP",
      });
    } else if (t === "addon") {
      onChange({
        mappedProductId: value.mappedProductId ?? "",
        mappedVariantId: null,
        mappedMode: "ADDON",
      });
    } else {
      onChange({
        mappedProductId: null,
        mappedVariantId: value.mappedVariantId ?? "",
      });
    }
  };

  const selectedProduct = value.mappedProductId
    ? (productCandidates.find((p) => p.id === value.mappedProductId) ?? null)
    : null;
  const selectedVariant = value.mappedVariantId
    ? (variantCandidates.find((p) => p.id === value.mappedVariantId) ?? null)
    : null;

  return (
    <div className="space-y-2.5 rounded-md border border-[var(--jm-border)] bg-[var(--jm-bg)] p-3">
      {/* 라벨 + 삭제 */}
      <div className="flex items-center gap-2">
        <JmInput
          size="sm"
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
          onFocus={focusCaretEnd}
          placeholder="옵션값 라벨 (화이트, 32GB, 수냉)"
          className="flex-1"
        />
        <JmIconButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label="옵션값 삭제"
          className="text-[var(--jm-danger-fg)]"
        >
          <Trash2 />
        </JmIconButton>
      </div>

      {/* 연결 방식 */}
      <div className="space-y-1">
        <label className="text-jm-2xs text-[var(--jm-text-muted)]">연결 방식</label>
        <JmSegmentedControl
          size="sm"
          ariaLabel="옵션값 연결 방식"
          value={linkType}
          onChange={(t) => setLinkType(t as LinkType)}
          options={[
            { value: "text", label: "텍스트" },
            { value: "swap", label: "상품 교체" },
            { value: "addon", label: "상품 추가" },
            { value: "variant", label: "변형" },
          ]}
        />
        <p className="text-jm-2xs text-[var(--jm-text-muted)]">
          {linkType === "text"
            ? "단순 선택지 — 연결된 단품 없음"
            : linkType === "swap"
              ? "이 값 선택 시 주문 상품이 아래 단품으로 교체됩니다 (색상·사이즈)"
              : linkType === "addon"
                ? "이 값 선택 시 아래 단품이 별도 라인으로 함께 결제됩니다"
                : "매장 변형(variant) 으로 연결"}
        </p>
      </div>

      {/* 단품 선택 (교체/추가) */}
      {(linkType === "swap" || linkType === "addon") && (
        <div className="space-y-1.5">
          <ProductCombobox
            products={productCandidates}
            value={value.mappedProductId ?? ""}
            onChange={(p) => onChange({ mappedProductId: p.id })}
            placeholder={productsLoading ? "로딩…" : "연결할 단품 선택"}
            clearable={false}
          />
          {selectedProduct && <SelectedItemCard product={selectedProduct} />}
        </div>
      )}

      {/* 변형 선택 */}
      {linkType === "variant" && (
        <div className="space-y-1.5">
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
          {selectedVariant && <SelectedItemCard product={selectedVariant} />}
        </div>
      )}

      {/* 추가 금액 — 교체(SWAP)는 단품 가격을 그대로 쓰므로 제외 */}
      {linkType !== "swap" && (
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-jm-2xs text-[var(--jm-text-muted)]">
            추가 금액
          </label>
          <JmInput
            size="sm"
            type="text"
            inputMode="numeric"
            value={value.addPrice}
            onChange={(e) =>
              onChange({ addPrice: e.target.value.replace(/[^0-9]/g, "") })
            }
            onFocus={focusCaretEnd}
            placeholder="0"
            className="w-32 tabular-nums"
          />
        </div>
      )}
    </div>
  );
}

/** 선택된 단품/변형 카드 — 썸네일 + 이름 + SKU + 가격 */
function SelectedItemCard({ product }: { product: ProductOption }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface-muted)] px-2.5 py-2">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-9 shrink-0 rounded-md border border-[var(--jm-border)] object-cover"
        />
      ) : (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--jm-border)] bg-[var(--jm-surface)] text-jm-xs font-semibold text-[var(--jm-text-muted)]">
          {product.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-jm-xs font-medium text-[var(--jm-text)]">
          {product.name}
        </div>
        <div className="flex items-center gap-1.5 text-jm-2xs text-[var(--jm-text-muted)]">
          <span className="font-[family-name:var(--jm-font-mono)]">
            {product.sku}
          </span>
          {product.sellingPrice != null && (
            <span className="tabular-nums">
              · ₩{Number(product.sellingPrice).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
