"use client";

import { useState } from "react";
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

import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { replaceSetComponents } from "@/lib/product-mutations";
import type { ProductDetail } from "../types";

interface ProductSetComponentsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductDetail;
}

interface RowState {
  rowId: string;
  product: ProductOption | null;
  quantity: string;
  label: string;
}

const newRow = (): RowState => ({
  rowId: Math.random().toString(36).slice(2),
  product: null,
  quantity: "1",
  label: "",
});

export function ProductSetComponentsEditSheet(props: ProductSetComponentsEditSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductSetComponentsEditSheetContent {...props} />}
    </Sheet>
  );
}

function ProductSetComponentsEditSheetContent({
  onOpenChange,
  product,
}: ProductSetComponentsEditSheetProps) {
  const queryClient = useQueryClient();

  // 후보 상품 — 자기 자신 제외
  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "components", excludeId: product.id }),
    queryFn: () => apiGet<ProductOption[]>("/api/products?isSet=false"),
    select: (data) => data.filter((p) => p.id !== product.id),
  });

  // 초기 행: 기존 setComponents 매핑
  const [rows, setRows] = useState<RowState[]>(() => {
    const existing = (product.setComponents ?? []).map((sc) => ({
      rowId: Math.random().toString(36).slice(2),
      product: {
        id: sc.component.id,
        name: sc.component.name,
        sku: sc.component.sku,
        sellingPrice: "0",
        unitCost: null,
        unitOfMeasure: "EA",
        isSet: false,
      } as ProductOption,
      quantity: String(sc.quantity),
      label: sc.label ?? "",
    }));
    return existing.length > 0 ? existing : [newRow()];
  });

  const update = (rowId: string, patch: Partial<RowState>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  const remove = (rowId: string) =>
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // 검증
      const filled = rows.filter((r) => r.product);
      const seen = new Set<string>();
      for (const r of filled) {
        if (seen.has(r.product!.id)) {
          throw new Error("중복된 구성품이 있습니다");
        }
        seen.add(r.product!.id);
      }
      return replaceSetComponents(
        product.id,
        filled.map((r) => ({
          componentId: r.product!.id,
          quantity: r.quantity || "1",
          label: r.label.trim() || null,
        })),
      );
    },
    onSuccess: () => {
      toast.success("구성품이 저장되었습니다");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다"),
  });

  const products = productsQuery.data ?? [];

  return (
    <SheetContent side="bottom" className="h-[90vh] p-0 flex flex-col">
      <SheetHeader className="border-b border-border px-5 py-4 flex-shrink-0">
        <SheetTitle>
          {product.productType === "ASSEMBLED" ? "조립" : "세트"} 구성품 편집
        </SheetTitle>
        <SheetDescription className="text-xs">
          구성품을 추가/수정/삭제합니다. 라벨은 표시용 별칭(예: &ldquo;메인&rdquo;, &ldquo;보너스&rdquo;)으로 비워둘 수 있습니다.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row) => (
            <div key={row.rowId} className="rounded-md border border-border p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_auto] gap-2 items-end">
                <FieldSm label="구성품">
                  <ProductCombobox
                    products={products}
                    value={row.product?.id ?? ""}
                    onChange={(p) => update(row.rowId, { product: p })}
                    filterType="component"
                  />
                </FieldSm>
                <FieldSm label="수량 (세트 1개당)">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                        update(row.rowId, { quantity: v });
                      }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-9"
                  />
                </FieldSm>
                <FieldSm label="라벨 (선택)">
                  <Input
                    value={row.label}
                    onChange={(e) => update(row.rowId, { label: e.target.value })}
                    placeholder="메인, 보너스 등"
                    className="h-9"
                  />
                </FieldSm>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(row.rowId)}
                  aria-label="행 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full"
            onClick={addRow}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            구성품 추가
          </Button>
        </div>

        <div className="border-t border-border px-5 py-4 flex justify-end gap-2 bg-background flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            취소
          </Button>
          <Button
            type="button"
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

function FieldSm({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
