"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { focusCaretEnd } from "@/jm/lib/focus";
import { ProductCombobox, type ProductOption } from "@/components/product-combobox";
import { ApiError, apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { replaceSetComponents } from "@/lib/product-mutations";
import {
  JmButton,
  JmDrawer,
  JmDrawerContent,
  JmDrawerDescription,
  JmDrawerHeader,
  JmDrawerTitle,
  JmIconButton,
  JmInput,
} from "@/jm";
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
    <JmDrawer open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <ProductSetComponentsEditSheetContent {...props} />}
    </JmDrawer>
  );
}

function ProductSetComponentsEditSheetContent({
  onOpenChange,
  product,
}: ProductSetComponentsEditSheetProps) {
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: queryKeys.products.list({ scope: "components", excludeId: product.id }),
    // isBulk=all — 벌크 SKU(엔진오일 벌크 등)도 BOM 후보에 포함. 기본값은 벌크 제외라
    // 이 옵션 없으면 기존 구성에 벌크가 들어있어도 콤보박스에서 이름이 안 뜨고 재선택 불가.
    queryFn: () => apiGet<ProductOption[]>("/api/products?isSet=false&isBulk=all"),
    select: (data) => data.filter((p) => p.id !== product.id),
  });

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
      toast.error(
        err instanceof ApiError ? err.message : err.message || "저장에 실패했습니다",
      ),
  });

  const products = productsQuery.data ?? [];

  return (
    <JmDrawerContent
      side="bottom"
      size="xl"
      className="flex flex-col p-0"
      dragHandle={false}
    >
      <JmDrawerHeader className="border-b border-[var(--jm-border)] px-5 py-4 flex-shrink-0">
        <JmDrawerTitle>
          {product.productType === "ASSEMBLED" ? "조립" : "세트"} 구성품 편집
        </JmDrawerTitle>
        <JmDrawerDescription className="text-jm-xs">
          구성품을 추가/수정/삭제합니다. 라벨은 표시용 별칭(예:{" "}
          &ldquo;메인&rdquo;, &ldquo;보너스&rdquo;)으로 비워둘 수 있습니다.
        </JmDrawerDescription>
      </JmDrawerHeader>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {rows.map((row) => (
            <div
              key={row.rowId}
              className="rounded-md border border-[var(--jm-border)] p-3 space-y-2"
            >
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
                  <JmInput
                    size="sm"
                    type="text"
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) {
                        update(row.rowId, { quantity: v });
                      }
                    }}
                    onFocus={focusCaretEnd}
                  />
                </FieldSm>
                <FieldSm label="라벨 (선택)">
                  <JmInput
                    size="sm"
                    value={row.label}
                    onChange={(e) => update(row.rowId, { label: e.target.value })}
                    onFocus={focusCaretEnd}
                    placeholder="메인, 보너스 등"
                  />
                </FieldSm>
                <JmIconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(row.rowId)}
                  aria-label="행 삭제"
                >
                  <Trash2 />
                </JmIconButton>
              </div>
            </div>
          ))}

          <JmButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
          >
            <Plus />
            <span>구성품 추가</span>
          </JmButton>
        </div>

        <div className="border-t border-[var(--jm-border)] px-5 py-4 flex justify-end gap-2 bg-[var(--jm-bg)] flex-shrink-0">
          <JmButton
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            취소
          </JmButton>
          <JmButton
            type="button"
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

function FieldSm({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-jm-xs text-[var(--jm-text-muted)]">{label}</label>
      {children}
    </div>
  );
}
