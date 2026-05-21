"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ApiError, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  JmBadge,
  JmButton,
  JmDialog,
  JmDialogBody,
  JmDialogContent,
  JmDialogFooter,
  JmDialogHeader,
  JmDialogTitle,
  JmInput,
  JmSelect,
} from "@/jm";

import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";

interface ProductBulkCardProps {
  product: Pick<
    ProductDetail,
    | "id"
    | "name"
    | "isBulk"
    | "containerSize"
    | "unitOfMeasure"
    | "sellingPrice"
    | "bulkProduct"
  >;
}

export function ProductBulkCard({ product }: ProductBulkCardProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", unitOfMeasure: "mL", containerSize: "" });

  const createBulkMutation = useMutation({
    mutationFn: () => apiMutate(`/api/products/${product.id}/bulk`, "POST", form),
    onSuccess: () => {
      toast.success("벌크 SKU가 생성되었습니다");
      setOpen(false);
      setForm({ name: "", unitOfMeasure: "mL", containerSize: "" });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(product.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "벌크 생성 실패"),
  });

  const sellingPriceNum = parseFloat(product.sellingPrice ?? "0");
  const containerSizeNum = parseFloat(form.containerSize || "0");
  const previewPrice =
    containerSizeNum > 0 && sellingPriceNum > 0 ? sellingPriceNum / containerSizeNum : 0;

  return (
    <>
      <ProductSection
        title="벌크 / 소분 관계"
        description={
          product.isBulk
            ? "이 상품은 다른 판매상품의 원료(벌크)로 사용됩니다."
            : product.bulkProduct
              ? "병·통 단위 상품을 소량 단위로 분할 사용할 수 있습니다."
              : "병·통 단위 상품을 mL/g 같은 소량 단위로 분할 사용하려면 벌크 SKU를 생성하세요."
        }
        actions={
          !product.isBulk && !product.bulkProduct ? (
            <JmButton
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({
                  name: `${product.name} (벌크)`,
                  unitOfMeasure: "mL",
                  containerSize: "",
                });
                setOpen(true);
              }}
            >
              <Plus />
              <span>벌크 SKU 생성</span>
            </JmButton>
          ) : null
        }
      >
        <div className="space-y-2 text-jm-sm px-3 py-2">
          {product.isBulk && (
            <div className="flex items-center gap-2 flex-wrap">
              <JmBadge variant="default" size="sm" shape="square">
                벌크 원료
              </JmBadge>
              {product.containerSize && (
                <span className="text-[var(--jm-text-muted)]">
                  · 용량 {product.containerSize} {product.unitOfMeasure}
                </span>
              )}
            </div>
          )}
          {product.bulkProduct && (
            <div className="flex items-center gap-2 flex-wrap">
              <JmBadge variant="outline" size="sm" shape="square">
                소분 원료 연결
              </JmBadge>
              <Link
                href={`/products/${product.bulkProduct.id}`}
                className="font-medium hover:underline text-[var(--jm-text)]"
              >
                {product.bulkProduct.name}
              </Link>
              <JmBadge
                variant="outline"
                size="sm"
                shape="square"
                className="text-jm-2xs"
              >
                {product.bulkProduct.sku}
              </JmBadge>
              {product.containerSize && (
                <span className="text-[var(--jm-text-muted)]">
                  · 1{product.unitOfMeasure} = {product.containerSize}{" "}
                  {product.bulkProduct.unitOfMeasure}
                </span>
              )}
            </div>
          )}
          {!product.isBulk && !product.bulkProduct && (
            <p className="text-[var(--jm-text-muted)] text-jm-xs">
              아직 연결된 벌크 SKU가 없습니다.
            </p>
          )}
        </div>
      </ProductSection>

      <JmDialog open={open} onOpenChange={setOpen}>
        <JmDialogContent size="md">
          <JmDialogHeader>
            <JmDialogTitle>벌크 SKU 생성</JmDialogTitle>
          </JmDialogHeader>
          <JmDialogBody>
            <div className="space-y-4">
              <p className="text-jm-xs text-[var(--jm-text-muted)]">
                병·통 단위 상품을 mL/g 같은 소량 단위로 분할 사용할 수 있도록 별도 SKU를
                만듭니다. 분할 소모 시 자동으로 병이 따져 벌크 재고가 채워집니다.
              </p>
              <div className="space-y-2">
                <label className="text-jm-xs text-[var(--jm-text-muted)]">
                  벌크 상품명
                </label>
                <JmInput
                  size="sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  onFocus={focusCaretEnd}
                  placeholder={`예: ${product.name} (벌크)`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">
                    벌크 단위
                  </label>
                  <JmSelect
                    size="sm"
                    value={form.unitOfMeasure}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, unitOfMeasure: v || "mL" }))
                    }
                    options={[
                      { value: "mL", label: "mL" },
                      { value: "L", label: "L" },
                      { value: "g", label: "g" },
                      { value: "kg", label: "kg" },
                      { value: "cm", label: "cm" },
                      { value: "mm", label: "mm" },
                    ]}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-jm-xs text-[var(--jm-text-muted)]">
                    1{product.unitOfMeasure} = ? {form.unitOfMeasure || "단위"}
                  </label>
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={form.containerSize}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        containerSize: e.target.value.replace(/[^\d.]/g, ""),
                      }))
                    }
                    onFocus={focusCaretEnd}
                    placeholder="4000"
                  />
                </div>
              </div>
              {previewPrice > 0 && (
                <p className="text-jm-xs text-[var(--jm-text-muted)]">
                  벌크 판매가: ₩{previewPrice.toFixed(4)} / {form.unitOfMeasure || "단위"} (병
                  가격 ÷ 용량 자동 환산)
                </p>
              )}
            </div>
          </JmDialogBody>
          <JmDialogFooter>
            <JmButton variant="ghost" onClick={() => setOpen(false)}>
              취소
            </JmButton>
            <JmButton
              variant="cta"
              onClick={() => createBulkMutation.mutate()}
              disabled={
                createBulkMutation.isPending ||
                !form.name.trim() ||
                !form.unitOfMeasure.trim() ||
                !form.containerSize ||
                parseFloat(form.containerSize) <= 0
              }
            >
              {createBulkMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              <span>생성</span>
            </JmButton>
          </JmDialogFooter>
        </JmDialogContent>
      </JmDialog>
    </>
  );
}
