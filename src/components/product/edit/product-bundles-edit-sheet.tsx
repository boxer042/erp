"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { formatComma, parseComma } from "@/lib/utils";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import type { ProductDetail, BundleProductItem } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

interface BundleDraft {
  rowId: string;
  id?: string; // 기존 row update 용
  bundleProductId: string;
  bundleProductName?: string;
  bundleProductSku?: string;
  bundleProductSellingPrice?: number;
  defaultQuantity: string;
  discountAmount: string;
  recommendMessage: string;
}

const tmpId = () => Math.random().toString(36).slice(2);

function fromBundle(b: BundleProductItem): BundleDraft {
  return {
    rowId: tmpId(),
    id: b.id,
    bundleProductId: b.bundleProductId,
    bundleProductName: b.bundleProduct.name,
    bundleProductSku: b.bundleProduct.sku,
    bundleProductSellingPrice: Number(b.bundleProduct.sellingPrice ?? 0),
    defaultQuantity: String(Number(b.defaultQuantity ?? 1)),
    discountAmount: b.discountAmount ? String(Number(b.discountAmount)) : "",
    recommendMessage: b.recommendMessage ?? "",
  };
}

function emptyBundle(): BundleDraft {
  return {
    rowId: tmpId(),
    bundleProductId: "",
    defaultQuantity: "1",
    discountAmount: "",
    recommendMessage: "",
  };
}

export function ProductBundlesEditSheet(props: Props) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <Body {...props} />}
    </Sheet>
  );
}

function Body({ product, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<BundleDraft[]>(() =>
    (product.bundles ?? []).map(fromBundle),
  );

  // 추가구매 candidates fetch — 자기 자신 / OPTION_PARENT / 변형(canonicalProductId 있는) 제외
  const productsQuery = useQuery<ProductOption[]>({
    queryKey: ["bundle-picker-products"],
    queryFn: () =>
      apiGet<ProductOption[]>(
        "/api/products?excludeVariants=true&includeHidden=1",
      ),
  });
  const candidates = useMemo(() => {
    const all = productsQuery.data ?? [];
    return all.filter(
      (p) => p.id !== product.id && p.productType !== "OPTION_PARENT",
    );
  }, [productsQuery.data, product.id]);

  const createMutation = useMutation({
    mutationFn: (draft: BundleDraft) =>
      apiMutate(`/api/products/${product.id}/bundles`, "POST", {
        bundleProductId: draft.bundleProductId,
        defaultQuantity: parseFloat(draft.defaultQuantity || "1") || 1,
        discountAmount: draft.discountAmount
          ? parseFloat(draft.discountAmount) || 0
          : null,
        recommendMessage: draft.recommendMessage || null,
        sortOrder: 0,
        isActive: true,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ draft }: { draft: BundleDraft }) =>
      apiMutate(`/api/products/${product.id}/bundles/${draft.id}`, "PATCH", {
        defaultQuantity: parseFloat(draft.defaultQuantity || "1") || 1,
        discountAmount: draft.discountAmount
          ? parseFloat(draft.discountAmount) || 0
          : null,
        recommendMessage: draft.recommendMessage || null,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (bundleId: string) =>
      apiMutate(`/api/products/${product.id}/bundles/${bundleId}`, "DELETE"),
  });

  const submitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const addBundle = () => setDrafts((prev) => [...prev, emptyBundle()]);
  const removeBundle = (rowId: string) =>
    setDrafts((prev) => prev.filter((d) => d.rowId !== rowId));
  const updateBundle = (rowId: string, patch: Partial<BundleDraft>) =>
    setDrafts((prev) =>
      prev.map((d) => (d.rowId === rowId ? { ...d, ...patch } : d)),
    );

  const handleSubmit = async () => {
    for (const d of drafts) {
      if (!d.bundleProductId.trim()) {
        toast.error("추가 상품 ID 를 입력하세요");
        return;
      }
      if (d.bundleProductId === product.id) {
        toast.error("자기 자신을 추가구매로 매핑할 수 없습니다");
        return;
      }
    }

    const existingIds = new Set((product.bundles ?? []).map((b) => b.id));
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
      toast.success("추가구매가 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "저장 실패");
    }
  };

  return (
    <SheetContent
      side="right"
      className="w-full sm:max-w-[640px] flex flex-col p-0"
    >
      <SheetHeader className="px-5 py-4 border-b">
        <SheetTitle>추가구매 추천 편집 — {product.name}</SheetTitle>
        <SheetDescription>
          이 상품과 함께 사면 좋은 단독 카탈로그 상품을 추천 목록으로 등록합니다.
          ProductOption (옵션 슬롯) 과 다른 도메인 — 손님이 카트 추가 시 별도 선택.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {drafts.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            추가구매 매핑이 없습니다. 아래 [추가] 버튼으로 시작하세요.
          </div>
        )}

        {drafts.map((d) => (
          <div
            key={d.rowId}
            className="rounded-lg border bg-card p-4 space-y-2.5"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">추가 상품</Label>
                <ProductCombobox
                  products={candidates}
                  value={d.bundleProductId}
                  onChange={(p) =>
                    updateBundle(d.rowId, {
                      bundleProductId: p.id,
                      bundleProductName: p.name,
                      bundleProductSku: p.sku,
                      bundleProductSellingPrice: parseFloat(p.sellingPrice) || 0,
                    })
                  }
                  placeholder={
                    productsQuery.isPending ? "상품 로드 중..." : "상품 선택..."
                  }
                  clearable={false}
                />
                {d.bundleProductName && (
                  <span className="font-mono text-[11px] text-muted-foreground block">
                    {d.bundleProductSku}
                    {d.bundleProductSellingPrice
                      ? ` · ₩${d.bundleProductSellingPrice.toLocaleString("ko-KR")}`
                      : ""}
                  </span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-destructive"
                onClick={() => removeBundle(d.rowId)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">기본 수량</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={d.defaultQuantity}
                  onChange={(e) =>
                    updateBundle(d.rowId, {
                      defaultQuantity: e.target.value.replace(/[^0-9.]/g, ""),
                    })
                  }
                  className="h-8 text-xs tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">번들 할인 (세전)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatComma(d.discountAmount)}
                  onChange={(e) =>
                    updateBundle(d.rowId, {
                      discountAmount: parseComma(e.target.value),
                    })
                  }
                  placeholder="할인 없음"
                  className="h-8 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">추천 카피 (선택)</Label>
              <Input
                value={d.recommendMessage}
                onChange={(e) =>
                  updateBundle(d.rowId, { recommendMessage: e.target.value })
                }
                placeholder="예: 필터도 함께 쓰세요 / 정수기 살균 전용"
                className="h-8 text-xs"
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="w-full h-10"
          onClick={addBundle}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> 추가구매 추가
        </Button>

        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          상품 검색 — 이름·SKU 로 찾기. 자기 자신과 OPTION_PARENT (옵션 대표) 는 자동 제외.
        </div>
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
