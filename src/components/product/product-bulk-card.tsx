"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiMutate } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

import { ProductSection } from "./product-section";
import type { ProductDetail } from "./types";

interface ProductBulkCardProps {
  product: Pick<
    ProductDetail,
    "id" | "name" | "isBulk" | "containerSize" | "unitOfMeasure" | "sellingPrice" | "bulkProduct"
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
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                setForm({
                  name: `${product.name} (벌크)`,
                  unitOfMeasure: "mL",
                  containerSize: "",
                });
                setOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              벌크 SKU 생성
            </Button>
          ) : null
        }
      >
        <div className="space-y-2 text-sm px-3 py-2">
          {product.isBulk && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">벌크 원료</Badge>
              {product.containerSize && (
                <span className="text-muted-foreground">
                  · 용량 {product.containerSize} {product.unitOfMeasure}
                </span>
              )}
            </div>
          )}
          {product.bulkProduct && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">소분 원료 연결</Badge>
              <Link
                href={`/products/${product.bulkProduct.id}`}
                className="font-medium hover:underline"
              >
                {product.bulkProduct.name}
              </Link>
              <Badge variant="outline" className="text-[10px]">{product.bulkProduct.sku}</Badge>
              {product.containerSize && (
                <span className="text-muted-foreground">
                  · 1{product.unitOfMeasure} = {product.containerSize} {product.bulkProduct.unitOfMeasure}
                </span>
              )}
            </div>
          )}
          {!product.isBulk && !product.bulkProduct && (
            <p className="text-muted-foreground text-xs">
              아직 연결된 벌크 SKU가 없습니다.
            </p>
          )}
        </div>
      </ProductSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>벌크 SKU 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              병·통 단위 상품을 mL/g 같은 소량 단위로 분할 사용할 수 있도록 별도 SKU를 만듭니다. 분할 소모 시 자동으로 병이 따져 벌크 재고가 채워집니다.
            </p>
            <div className="space-y-2">
              <Label>벌크 상품명</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={`예: ${product.name} (벌크)`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>벌크 단위</Label>
                <Input
                  value={form.unitOfMeasure}
                  onChange={(e) => setForm((p) => ({ ...p, unitOfMeasure: e.target.value }))}
                  placeholder="mL"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  1{product.unitOfMeasure} = ? {form.unitOfMeasure || "단위"}
                </Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.containerSize}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, containerSize: e.target.value.replace(/[^\d.]/g, "") }))
                  }
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="4000"
                />
              </div>
            </div>
            {previewPrice > 0 && (
              <p className="text-xs text-muted-foreground">
                벌크 판매가: ₩{previewPrice.toFixed(4)} / {form.unitOfMeasure || "단위"} (병 가격 ÷ 용량 자동 환산)
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => createBulkMutation.mutate()}
              disabled={
                createBulkMutation.isPending ||
                !form.name.trim() ||
                !form.unitOfMeasure.trim() ||
                !form.containerSize ||
                parseFloat(form.containerSize) <= 0
              }
            >
              {createBulkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              생성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
