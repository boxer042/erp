"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, ChevronDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

import { ApiError, apiGet, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
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
  /** SWAP: 메인 라인 productId 교체 (색상/사이즈 같은 변형) / ADDON: 자식 OrderItem 추가 */
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

  // 옵션값 매핑 candidates fetch — 자기 자신 / OPTION_PARENT 제외
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
  // variant candidates — canonicalProductId 가 있는 상품 (변형) 만. 거의 안 쓰이지만 모드 B 폴백
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
                    productCandidates={productCandidates}
                    variantCandidates={variantCandidates}
                    productsLoading={productsQuery.isPending}
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
 * Product 매핑 시 SWAP(메인 라인 교체, 색상/사이즈) / ADDON(자식 라인 추가) 모드 토글.
 * Combobox 로 상품 검색 (이름·SKU). 자기 자신 + OPTION_PARENT 제외 (호출측 candidates 필터).
 */
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
          className="text-[10px] px-1.5 py-0.5 rounded border bg-secondary hover:bg-secondary/80 inline-flex items-center gap-0.5 shrink-0"
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
      {/* SWAP / ADDON 토글 — Product 매핑일 때만 의미 */}
      {mode === "product" && (
        <button
          type="button"
          onClick={toggleMappedMode}
          title={
            value.mappedMode === "SWAP"
              ? "SWAP — 옵션 선택 시 메인 라인 productId 가 매핑된 SKU 로 교체됨 (색상·사이즈 변형)"
              : "ADDON — 옵션 선택 시 자식 OrderItem 자동 추가됨 (메인 + 부속 결제). 일반 추가구매는 BundleProduct 도메인 권장"
          }
          className="text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center justify-center gap-0.5 bg-background hover:bg-secondary/40 self-start"
        >
          모드: <span className="font-semibold">{value.mappedMode}</span>
        </button>
      )}
    </div>
  );
}
